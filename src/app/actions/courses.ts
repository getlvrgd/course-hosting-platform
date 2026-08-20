"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { requireActor, resolveHubAdminAction, spansHubs } from "@/lib/access";
import { loadTree } from "@/lib/catalog";
import { isLessonKind, isVideoKind, type Attachment, type CourseTree } from "@/lib/course";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { isTint, isVisibility, slugify, STATUS, VISIBILITY } from "@/lib/options";
import { resolvePoster } from "@/lib/poster";

/**
 * Everything that writes a course.
 *
 * **Nothing on the editing path calls `revalidatePath`.** Every page in this app is
 * `force-dynamic`, so revalidation buys no freshness — what it does buy is a full
 * re-render of the current route pushed back inside the action's response. On the
 * autosave that is actively wrong: the new tree arrives as a prop while somebody is
 * still typing, the editor swaps its state for the server's, and a keystroke made
 * after the save was queued is thrown away. Revalidation is kept only where the page
 * itself has to change — a course published, deleted, or renamed in its header.
 *
 * Two shapes of action, on purpose:
 *
 *   * **Structural** — adding, deleting, reordering — returns the whole course tree.
 *     The editor replaces its state with what comes back rather than trying to keep a
 *     parallel copy in step, so a dropped lesson can never end up in two places at
 *     once on screen and one in the database.
 *
 *   * **Field edits** — a title, the writing, a video — return only whether they
 *     landed. Those fire on a debounce while someone is typing, and shipping the whole
 *     tree back on every keystroke would fight the caret.
 *
 * Every one of them re-resolves the hub from what it was given rather than trusting
 * it, so an id belonging to another offer is a 404 and never a way in. The course id
 * alone is not a permission — the hub it sits in is.
 */

export type TreeResult = { tree: CourseTree | null; error?: string };

const ok = async (courseId: string, hubId: string): Promise<TreeResult> => ({
  tree: await loadTree(courseId, hubId),
});

/**
 * The chapter, its course and its hub, with this person checked against all three.
 *
 * Walking up to the hub on every call is the whole safety property: an admin of one
 * offer holding a chapter id from another gets a 404, exactly as a stranger would.
 */
async function chapterContext(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, courseId: true, course: { select: { hubId: true } } },
  });
  if (!chapter) notFound();
  const { hub } = await resolveHubAdminAction(chapter.course.hubId);
  return { ...chapter, hubId: hub.id };
}

/**
 * The same, from a lesson — two levels up instead of one.
 *
 * The hub is fetched *with* the lesson rather than looked up afterwards. This runs on
 * every debounced keystroke while somebody writes a lesson, so the difference between
 * three round trips and two is the difference between a save that keeps up and one
 * that lags behind the typing.
 */
async function lessonContext(lessonId: string) {
  const [actor, lesson] = await Promise.all([
    requireActor(),
    prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        chapterId: true,
        chapter: {
          select: {
            courseId: true,
            course: { select: { hub: { select: { id: true, status: true } } } },
          },
        },
      },
    }),
  ]);
  if (!lesson) notFound();

  // The same rules resolveHubAdminAction applies, against the hub already in hand.
  const hub = lesson.chapter.course.hub;
  if (!isAdmin(actor)) notFound();
  if (!spansHubs(actor) && actor.hubId !== hub.id) notFound();
  if (hub.status !== STATUS.LIVE && !isAdmin(actor)) notFound();

  return {
    id: lesson.id,
    chapterId: lesson.chapterId,
    courseId: lesson.chapter.courseId,
    hubId: hub.id,
  };
}

/**
 * A slug nobody else is using.
 *
 * Settled by asking rather than by catching the unique violation, because the caller
 * wants the slug it ended up with — the editor shows it, and it is half the URL a
 * student is given.
 */
async function freeSlug(hubId: string, desired: string, exceptId?: string) {
  const base = slugify(desired);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    // Only within this hub: two offers may both have a "Start Here", and neither
    // should be pushed to "start-here-2" because of the other.
    const clash = await prisma.course.findFirst({
      where: { hubId, slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
  }
  // Fifty "start-here-N" in a row is not a real scenario, but a duplicate insert is
  // worse than an ugly slug.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Renumbers a chapter's lessons 0..n so positions stay contiguous after a move.
 *
 * Read-then-write rather than one clever UPDATE, because the order it has to write is
 * the order the drop produced, not anything the database can derive on its own.
 */
async function renumberLessons(chapterId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { chapterId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    lessons.map((lesson, index) =>
      prisma.lesson.update({ where: { id: lesson.id }, data: { position: index } }),
    ),
  );
}

/* --------------------------------------------------------------------- courses -- */

export type CourseState = { error?: string; ok?: string };

const CourseSchema = z.object({
  title: z.string().trim().min(1, "Give the course a name").max(120),
});

/**
 * A new course, which lands hidden.
 *
 * Hidden rather than published is the whole point of the default: a course appears on
 * the student grid because someone decided it was ready, never because it was created.
 */
export async function createCourse(
  _prev: CourseState,
  formData: FormData,
): Promise<CourseState> {
  const { hub } = await resolveHubAdminAction(String(formData.get("hubId") ?? ""));

  const parsed = CourseSchema.safeParse({ title: String(formData.get("title") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const last = await prisma.course.findFirst({
    where: { hubId: hub.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const course = await prisma.course.create({
    data: {
      hubId: hub.id,
      title: parsed.data.title,
      slug: await freeSlug(hub.id, parsed.data.title),
      position: (last?.position ?? -1) + 1,
      visibility: VISIBILITY.HIDDEN,
      // One chapter to start, because an outline with nothing in it gives you nowhere
      // to put the first lesson.
      chapters: { create: { title: "Chapter 1", position: 0 } },
    },
    select: { id: true },
  });

  revalidatePath(`/h/${hub.slug}/manage`);
  redirect(`/h/${hub.slug}/manage/${course.id}`);
}

const SettingsSchema = z.object({
  title: z.string().trim().min(1, "Give the course a name").max(120),
  slug: z.string().trim().max(60).optional(),
  description: z.string().trim().max(400).optional(),
  thumbnailUrl: z.string().optional(),
  accent: z.string().optional(),
  visibility: z.string().optional(),
});

/** The course's own fields: its name, its art, its tint, and whether students see it. */
export async function saveCourseSettings(
  _prev: CourseState,
  formData: FormData,
): Promise<CourseState> {
  const courseId = String(formData.get("courseId") ?? "");
  const found = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, hubId: true },
  });
  if (!found) notFound();
  const { hub } = await resolveHubAdminAction(found.hubId);
  const course = found;

  const parsed = SettingsSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    thumbnailUrl: String(formData.get("thumbnailUrl") ?? ""),
    accent: String(formData.get("accent") ?? ""),
    visibility: String(formData.get("visibility") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  // The slug is only touched when it actually changed, so saving the settings form
  // cannot quietly break a link that has already been handed out.
  const wanted = data.slug ? slugify(data.slug) : course.slug;
  const slug =
    wanted === course.slug ? course.slug : await freeSlug(hub.id, wanted, course.id);

  await prisma.course.update({
    where: { id: course.id },
    data: {
      title: data.title,
      slug,
      description: data.description || null,
      thumbnailUrl: data.thumbnailUrl || null,
      // Anything off the list falls back to a default rather than reaching a style
      // attribute — see isTint.
      accent: isTint(data.accent) ? data.accent : "violet",
      visibility: isVisibility(data.visibility) ? data.visibility : VISIBILITY.HIDDEN,
    },
  });

  // This one does revalidate: the course's name and URL are in the page header above
  // the form, and a save that leaves the old name sitting there reads as a save that
  // did not happen.
  revalidatePath(`/h/${hub.slug}/manage/${course.id}`);
  revalidatePath(`/h/${hub.slug}/manage`);
  return { ok: "Saved." };
}

/** Publish or hide from the manage grid, without opening the course. */
export async function setCourseVisibility(formData: FormData) {
  const courseId = String(formData.get("courseId") ?? "");
  const visibility = String(formData.get("visibility") ?? "");
  if (!isVisibility(visibility)) return;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { hubId: true },
  });
  if (!course) return;
  const { hub } = await resolveHubAdminAction(course.hubId);

  await prisma.course.update({ where: { id: courseId }, data: { visibility } });
  revalidatePath(`/h/${hub.slug}/manage`);
  revalidatePath(`/h/${hub.slug}`);
}

/**
 * Deletes a course and everything under it, including everyone's progress on it.
 *
 * Owner-only, and the confirmation is the typed name in the form — the one action here
 * that cannot be undone by re-adding what was removed.
 */
export async function deleteCourse(formData: FormData) {
  const courseId = String(formData.get("courseId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { title: true, hubId: true },
  });
  if (!course) notFound();

  const { hub } = await resolveHubAdminAction(course.hubId);
  // Any admin of this offer may delete a course in it — that is running the offer.
  // Deleting the *offer* is still the owner's; see deleteHub.
  if (confirm !== course.title) return;

  await prisma.course.delete({ where: { id: courseId } });
  revalidatePath(`/h/${hub.slug}/manage`);
  revalidatePath(`/h/${hub.slug}`);
  redirect(`/h/${hub.slug}/manage`);
}

/** The order of the tiles on both grids, saved as one list. */
export async function reorderCourses(
  hubId: string,
  ids: string[],
): Promise<{ ok: boolean }> {
  const { hub } = await resolveHubAdminAction(hubId);

  // Only this hub's courses, so an id from another offer is dropped rather than
  // renumbered into this one.
  const known = await prisma.course.findMany({
    where: { hubId: hub.id },
    select: { id: true },
  });
  const valid = new Set(known.map((course) => course.id));
  // Unknown ids are dropped rather than rejected: a course deleted in another tab
  // should not stop this rearrangement landing.
  const order = ids.filter((id) => valid.has(id));

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.course.update({ where: { id }, data: { position: index } }),
    ),
  );

  revalidatePath(`/h/${hub.slug}/manage`);
  revalidatePath(`/h/${hub.slug}`);
  return { ok: true };
}

/* -------------------------------------------------------------------- chapters -- */

export async function addChapter(courseId: string): Promise<TreeResult> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { hubId: true },
  });
  if (!course) notFound();
  const { hub } = await resolveHubAdminAction(course.hubId);

  const count = await prisma.chapter.count({ where: { courseId } });
  await prisma.chapter.create({
    data: { courseId, title: `Chapter ${count + 1}`, position: count },
  });

  return ok(courseId, hub.id);
}

export async function renameChapter(
  chapterId: string,
  title: string,
): Promise<{ ok: boolean }> {
  await chapterContext(chapterId);

  await prisma.chapter.update({
    where: { id: chapterId },
    // An empty title would leave an unclickable blank row in the outline.
    data: { title: title.trim().slice(0, 120) || "Untitled chapter" },
  });
  return { ok: true };
}

/** Deletes a chapter and the lessons in it. Their progress rows go with them. */
export async function deleteChapter(chapterId: string): Promise<TreeResult> {
  const { courseId, hubId } = await chapterContext(chapterId);

  await prisma.chapter.delete({ where: { id: chapterId } });
  const rest = await prisma.chapter.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    rest.map((chapter, index) =>
      prisma.chapter.update({ where: { id: chapter.id }, data: { position: index } }),
    ),
  );

  return ok(courseId, hubId);
}

/** Drags a chapter to a new place in the outline. */
export async function moveChapter(
  chapterId: string,
  toIndex: number,
): Promise<TreeResult> {
  const { courseId, hubId } = await chapterContext(chapterId);

  const chapters = await prisma.chapter.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const from = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (from === -1) return ok(courseId, hubId);

  const order = chapters.map((chapter) => chapter.id);
  const [moved] = order.splice(from, 1);
  order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, moved);

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.chapter.update({ where: { id }, data: { position: index } }),
    ),
  );

  return ok(courseId, hubId);
}

/* --------------------------------------------------------------------- lessons -- */

export async function addLesson(
  chapterId: string,
  kind: string,
): Promise<TreeResult & { lessonId?: string }> {
  const { courseId, hubId } = await chapterContext(chapterId);

  const count = await prisma.lesson.count({ where: { chapterId } });
  const lesson = await prisma.lesson.create({
    data: {
      chapterId,
      title: "New lesson",
      position: count,
      kind: isLessonKind(kind) ? kind : "MULTIMEDIA",
    },
    select: { id: true },
  });

  return { ...(await ok(courseId, hubId)), lessonId: lesson.id };
}

/**
 * Everything on the lesson pane, as a partial.
 *
 * Only the keys present are written, so the debounced title save and a video being
 * attached at the same moment do not overwrite each other.
 */
const LessonPatch = z.object({
  title: z.string().max(200).optional(),
  kind: z.string().optional(),
  content: z.string().max(20000).optional(),
  videoKind: z.string().optional(),
  videoUrl: z.string().max(2000).optional(),
  videoName: z.string().max(300).optional(),
  thumbnailUrl: z.string().optional(),
  posterUrl: z.string().optional(),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 24).nullable().optional(),
  dripDays: z.number().int().min(0).max(3650).optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(300),
        url: z.string().max(2000),
        size: z.number().int().min(0),
        type: z.string().max(200),
      }),
    )
    .max(50)
    .optional(),
});

export type LessonPatchInput = z.input<typeof LessonPatch>;

export async function saveLesson(
  lessonId: string,
  patch: LessonPatchInput,
): Promise<{ ok: boolean; error?: string }> {
  await lessonContext(lessonId);

  const parsed = LessonPatch.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That didn't save." };
  }
  const data = parsed.data;

  /*
   * An embed being attached gets its still fetched from the host, here, once.
   *
   * Only when the patch is actually setting the link, and only when the browser has
   * not already supplied one — an upload grabs its own frame before it sends the file,
   * and that is a better picture than anything this could go and ask for.
   *
   * `resolvePoster` never throws and gives up after a couple of seconds, so a slow or
   * broken thumbnail service costs the save a moment, not the video.
   */
  let poster = data.posterUrl;
  if (poster === undefined && data.videoKind === "EMBED" && data.videoUrl) {
    poster = (await resolvePoster(data.videoUrl)) ?? "";
  }

  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      ...(data.title !== undefined
        ? { title: data.title.trim() || "Untitled lesson" }
        : {}),
      ...(data.kind !== undefined && isLessonKind(data.kind) ? { kind: data.kind } : {}),
      ...(data.content !== undefined ? { content: data.content || null } : {}),
      ...(data.videoKind !== undefined && isVideoKind(data.videoKind)
        ? { videoKind: data.videoKind }
        : {}),
      ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl || null } : {}),
      ...(data.videoName !== undefined ? { videoName: data.videoName || null } : {}),
      ...(data.thumbnailUrl !== undefined
        ? { thumbnailUrl: data.thumbnailUrl || null }
        : {}),
      ...(poster !== undefined ? { posterUrl: poster || null } : {}),
      ...(data.durationSeconds !== undefined
        ? { durationSeconds: data.durationSeconds }
        : {}),
      ...(data.dripDays !== undefined ? { dripDays: data.dripDays } : {}),
      ...(data.attachments !== undefined
        ? { attachments: data.attachments as Attachment[] }
        : {}),
    },
  });

  // Deliberately no revalidation: see the note at the top of this file. The editor
  // already has this change on screen — it put it there before calling.
  return { ok: true };
}

export async function deleteLesson(lessonId: string): Promise<TreeResult> {
  const { courseId, chapterId, hubId } = await lessonContext(lessonId);

  await prisma.lesson.delete({ where: { id: lessonId } });
  await renumberLessons(chapterId);

  return ok(courseId, hubId);
}

/**
 * Drags a lesson, either within its chapter or into another one.
 *
 * Both chapters are renumbered afterwards rather than only the destination, because a
 * lesson leaving a chapter opens a hole in it that the next drop would otherwise land
 * in the middle of.
 */
export async function moveLesson(
  lessonId: string,
  toChapterId: string,
  toIndex: number,
): Promise<TreeResult> {
  const lesson = await lessonContext(lessonId);
  const target = await chapterContext(toChapterId);

  // A lesson cannot be dragged into another course — the outline never offers it, and
  // a crafted call must not manage it either.
  if (target.courseId !== lesson.courseId) return ok(lesson.courseId, lesson.hubId);

  const siblings = await prisma.lesson.findMany({
    where: { chapterId: toChapterId, id: { not: lessonId } },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const order = siblings.map((row) => row.id);
  order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, lessonId);

  // The parent move and the renumbering go together: a lesson that changed chapter but
  // kept an old position would sort into the middle of its new neighbours.
  await prisma.$transaction([
    prisma.lesson.update({
      where: { id: lessonId },
      data: { chapterId: toChapterId },
    }),
    ...order.map((id, index) =>
      prisma.lesson.update({ where: { id }, data: { position: index } }),
    ),
  ]);

  // The chapter it left now has a hole in it, which the next drop would land inside.
  if (lesson.chapterId !== toChapterId) await renumberLessons(lesson.chapterId);

  return ok(lesson.courseId, lesson.hubId);
}

/**
 * "Paste video" — takes the video off another lesson without re-uploading it.
 *
 * The two lessons end up pointing at the same stored file, which is deliberate: it is
 * the same video, and copying the bytes to say so would double the storage bill for
 * nothing. Deleting one lesson does not remove the file the other is playing.
 */
export async function copyVideoFrom(
  lessonId: string,
  sourceLessonId: string,
): Promise<TreeResult> {
  const lesson = await lessonContext(lessonId);

  const source = await prisma.lesson.findFirst({
    // Only from a lesson in the same hub: a video is the offer's property, and
    // pointing one offer's lesson at another's file would quietly share it.
    where: {
      id: sourceLessonId,
      chapter: { course: { hubId: lesson.hubId } },
    },
    select: {
      videoKind: true,
      videoUrl: true,
      videoName: true,
      durationSeconds: true,
      posterUrl: true,
    },
  });
  if (!source || source.videoKind === "NONE" || !source.videoUrl) {
    return {
      tree: await loadTree(lesson.courseId, lesson.hubId),
      error: "That lesson has no video.",
    };
  }

  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      videoKind: source.videoKind,
      videoUrl: source.videoUrl,
      videoName: source.videoName,
      durationSeconds: source.durationSeconds,
      // The same video, so the same still. A thumbnail chosen by hand on this lesson
      // is left alone — it still wins over this.
      posterUrl: source.posterUrl,
    },
  });

  return ok(lesson.courseId, lesson.hubId);
}

/** Every lesson that has a video, for the "paste from another lesson" picker. */
export async function listVideoSources(
  hubId: string,
): Promise<{ id: string; title: string; course: string; chapter: string }[]> {
  const { hub } = await resolveHubAdminAction(hubId);

  const lessons = await prisma.lesson.findMany({
    where: {
      videoKind: { not: "NONE" },
      videoUrl: { not: null },
      chapter: { course: { hubId: hub.id } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      chapter: { select: { title: true, course: { select: { title: true } } } },
    },
  });

  return lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    chapter: lesson.chapter.title,
    course: lesson.chapter.course.title,
  }));
}
