/**
 * The shape of a course as the editor and the player both hold it, and the arithmetic
 * every percentage in the app comes from.
 *
 * Shared by server and client — no `server-only` here — because the editor is one big
 * client component that keeps the whole tree in state and hands it back to the actions.
 */

/* ------------------------------------------------------------------ vocabularies -- */

export const LESSON_KINDS = {
  /** Text, images, video and file uploads — the everyday lesson. */
  MULTIMEDIA: "MULTIMEDIA",
  /** A PDF shown in the page. Still carries writing and files of its own. */
  PDF: "PDF",
} as const;

export type LessonKind = (typeof LESSON_KINDS)[keyof typeof LESSON_KINDS];

export const LESSON_KIND_OPTIONS: {
  value: LessonKind;
  label: string;
  note: string;
}[] = [
  {
    value: "MULTIMEDIA",
    label: "Multimedia",
    note: "Includes text, images, videos, and file uploads",
  },
  { value: "PDF", label: "PDF", note: "Embed a PDF document" },
];

export const isLessonKind = (value: unknown): value is LessonKind =>
  value === "MULTIMEDIA" || value === "PDF";

export const lessonKindLabel = (kind: string) =>
  ({ MULTIMEDIA: "Multimedia", PDF: "PDF" })[kind] ?? kind;

/**
 * Where a lesson's video came from.
 *
 * The distinction is not cosmetic: FILE is played by the browser's own <video>, so the
 * page can see the playhead and complete the lesson on its own. EMBED plays inside
 * someone else's iframe, where it cannot, so those lessons rely on the button.
 */
export const VIDEO_KINDS = {
  NONE: "NONE",
  FILE: "FILE",
  EMBED: "EMBED",
} as const;

export type VideoKind = (typeof VIDEO_KINDS)[keyof typeof VIDEO_KINDS];

export const isVideoKind = (value: unknown): value is VideoKind =>
  value === "NONE" || value === "FILE" || value === "EMBED";

/* ------------------------------------------------------------------ attachments -- */

/** One file hanging off a lesson. Stored as a JSON list on the row. */
export type Attachment = {
  id: string;
  name: string;
  url: string;
  /** Bytes, for the "2.4 MB" beside the name. */
  size: number;
  /** The browser's own MIME type, used to pick the mark beside the name. */
  type: string;
};

/**
 * Reads the JSON column back into a list, dropping anything that has lost its shape.
 *
 * Lenient on purpose: a lesson with one malformed attachment should show its other
 * three, not fail to open.
 */
export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  const out: Attachment[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.url !== "string" || typeof row.name !== "string") continue;
    out.push({
      id: typeof row.id === "string" ? row.id : row.url,
      name: row.name,
      url: row.url,
      size: typeof row.size === "number" ? row.size : 0,
      type: typeof row.type === "string" ? row.type : "",
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- tree -- */

export type LessonNode = {
  id: string;
  title: string;
  kind: LessonKind;
  position: number;
  videoKind: VideoKind;
  videoUrl: string | null;
  videoName: string | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  content: string | null;
  attachments: Attachment[];
  dripDays: number;
};

export type ChapterNode = {
  id: string;
  title: string;
  position: number;
  lessons: LessonNode[];
};

export type CourseTree = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  visibility: string;
  accent: string;
  chapters: ChapterNode[];
};

/**
 * The picture for a lesson, and the one place that decision is made.
 *
 * A hand-picked thumbnail wins, because someone went out of their way to choose it.
 * Otherwise it is the still taken from the video — which is the usual case, and the
 * reason nobody has to go and find artwork for forty lessons. Null means neither
 * exists, and the outline draws the lesson's kind instead.
 */
export function posterOf(
  lesson: Pick<LessonNode, "thumbnailUrl" | "posterUrl">,
): string | null {
  return lesson.thumbnailUrl || lesson.posterUrl || null;
}

/**
 * Where a protected upload is played from.
 *
 * A route on this app rather than the storage URL, so what reaches the browser is
 * something that only works with a session behind it. See
 * src/app/api/watch/[lessonId]/route.ts.
 */
export const watchPath = (lessonId: string) => `/api/watch/${lessonId}`;

/**
 * The lesson as it should be handed to the player.
 *
 * When uploads are protected this swaps the storage URL out **on the server**, before
 * anything is serialised — which is the whole point. Leaving the real URL in the page
 * and merely hiding the download button would be theatre: it sits in the network tab
 * either way, and a blob URL works for anyone in the world who has it.
 *
 * Embeds are returned untouched. A YouTube or Loom video is played by its own host in
 * its own iframe, and nothing this app does can change what that host allows.
 */
export function forPlayer<T extends LessonNode>(lesson: T, protect: boolean): T {
  if (!protect || lesson.videoKind !== "FILE" || !lesson.videoUrl) return lesson;
  return { ...lesson, videoUrl: watchPath(lesson.id) };
}

/* -------------------------------------------------------------------- arithmetic -- */

/**
 * The one place a percentage is computed.
 *
 * Rounded to whole numbers, and deliberately never rounded *up* to 100 — a student
 * one lesson short of the end must not be shown a finished course, so anything above
 * 99 that is not actually complete shows 99.
 */
export function percent(done: number, total: number) {
  if (total <= 0) return 0;
  if (done >= total) return 100;
  return Math.min(99, Math.round((done / total) * 100));
}

/** "1h 26m", "44m", "5m" — the runtime line under a course title. */
export function formatDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds < 0) return "";
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "14m" beside a lesson in the outline. Blank when nothing is known yet. */
export function formatLessonLength(seconds: number | null) {
  if (!seconds) return "";
  return formatDuration(seconds);
}

/** "2.4 MB" beside an attachment. */
export function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Chapter 3 · 5 lessons · 1h 26m" and the like — the count line a course tile and the
 * editor header both show.
 */
export function courseSummary(tree: { chapters: ChapterNode[] }) {
  const chapters = tree.chapters.length;
  const lessons = tree.chapters.reduce((sum, c) => sum + c.lessons.length, 0);
  const seconds = tree.chapters.reduce(
    (sum, chapter) =>
      sum +
      chapter.lessons.reduce((inner, lesson) => inner + (lesson.durationSeconds ?? 0), 0),
    0,
  );
  const parts = [
    `${chapters} ${chapters === 1 ? "chapter" : "chapters"}`,
    `${lessons} ${lessons === 1 ? "lesson" : "lessons"}`,
  ];
  const length = formatDuration(seconds);
  if (length) parts.push(length);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------------- drip -- */

/**
 * Whether a drip-fed lesson has opened yet, counted from the day the account was
 * created rather than from a fixed date — so someone who joins in March gets the same
 * run-up as someone who joined in January.
 *
 * Admins are never held back by this; that is decided by the caller, not here.
 */
export function dripUnlocksAt(dripDays: number, joinedAt: Date): Date | null {
  if (!dripDays || dripDays <= 0) return null;
  return new Date(joinedAt.getTime() + dripDays * 24 * 60 * 60 * 1000);
}

export function dripLabel(dripDays: number) {
  if (!dripDays || dripDays <= 0) return "Unlocks immediately";
  return `Unlocks ${dripDays} ${dripDays === 1 ? "day" : "days"} after joining`;
}
