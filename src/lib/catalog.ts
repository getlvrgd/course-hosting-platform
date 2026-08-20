import "server-only";

import { notFound } from "next/navigation";

import { isAdmin, type Actor } from "./auth";
import { prisma } from "./db";
import {
  dripUnlocksAt,
  isLessonKind,
  isVideoKind,
  parseAttachments,
  percent,
  type ChapterNode,
  type CourseTree,
  type LessonNode,
} from "./course";
import type { CourseCard, StudentRow } from "./catalog-types";
import { VISIBILITY } from "./options";

/**
 * Every read the app does of a course and of who has watched what.
 *
 * All progress arithmetic lands here rather than in the pages, so the figure a student
 * sees on their tile, the figure the students tab shows the owner, and the figure on
 * the progress board are the same number computed the same way — counted at read time
 * from LessonProgress, never denormalised onto a row that could drift.
 *
 * The queries are deliberately plain: fetch the lessons, fetch the completions, count
 * in JavaScript. At the size this is for — a few dozen courses, a few thousand rows —
 * that is one round trip and no correlated subqueries, and it stays readable.
 */

/**
 * The instant a page was read, for everything that renders as "3 days ago".
 *
 * Read here rather than inside a component for two reasons. A component that reads the
 * clock while rendering answers differently on the server and on the client, which is
 * a hydration mismatch on every dated row; and a table that reads it per row measures
 * each row against its own instant. One read, passed down, fixes both.
 */
export const readAt = () => Date.now();

/* ------------------------------------------------------------------------- trees -- */

const LESSON_FIELDS = {
  id: true,
  title: true,
  kind: true,
  position: true,
  videoKind: true,
  videoUrl: true,
  videoName: true,
  thumbnailUrl: true,
  posterUrl: true,
  durationSeconds: true,
  content: true,
  attachments: true,
  dripDays: true,
} as const;

type LessonRow = {
  id: string;
  title: string;
  kind: string;
  position: number;
  videoKind: string;
  videoUrl: string | null;
  videoName: string | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  content: string | null;
  attachments: unknown;
  dripDays: number;
};

/** A row as stored → a node as the editor and the player use it. */
function toLesson(row: LessonRow): LessonNode {
  return {
    id: row.id,
    title: row.title,
    // Anything unrecognised reads as the everyday kind rather than throwing: a lesson
    // that has somehow lost its kind should still open.
    kind: isLessonKind(row.kind) ? row.kind : "MULTIMEDIA",
    position: row.position,
    videoKind: isVideoKind(row.videoKind) ? row.videoKind : "NONE",
    videoUrl: row.videoUrl,
    videoName: row.videoName,
    thumbnailUrl: row.thumbnailUrl,
    posterUrl: row.posterUrl,
    durationSeconds: row.durationSeconds,
    content: row.content,
    attachments: parseAttachments(row.attachments),
    dripDays: row.dripDays,
  };
}

/**
 * One course, whole, in the order the outline shows it.
 *
 * This is what every editing action returns when it is done, so the client replaces
 * its state with the truth from the database rather than trying to keep a parallel
 * copy in step.
 */
export async function loadTree(courseId: string, hubId: string): Promise<CourseTree> {
  const course = await prisma.course.findFirst({
    // Bounded by the hub as well as the id, so a course id from another offer is a
    // 404 rather than a leak — the id alone is not a permission.
    where: { id: courseId, hubId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      thumbnailUrl: true,
      visibility: true,
      accent: true,
      chapters: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          lessons: { orderBy: { position: "asc" }, select: LESSON_FIELDS },
        },
      },
    },
  });
  if (!course) notFound();

  const chapters: ChapterNode[] = course.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    position: chapter.position,
    lessons: chapter.lessons.map(toLesson),
  }));

  return { ...course, chapters };
}

/* --------------------------------------------------------------------- the grids -- */

export type { CourseCard } from "./catalog-types";

type GridRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  visibility: string;
  accent: string;
  position: number;
  chapters: {
    lessons: { id: string; durationSeconds: number | null }[];
  }[];
};

const GRID_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  visibility: true,
  accent: true,
  position: true,
  chapters: {
    select: { lessons: { select: { id: true, durationSeconds: true } } },
  },
} as const;

function toCard(row: GridRow, done: Set<string>): CourseCard {
  const lessons = row.chapters.flatMap((chapter) => chapter.lessons);
  const completed = lessons.filter((lesson) => done.has(lesson.id)).length;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    thumbnailUrl: row.thumbnailUrl,
    visibility: row.visibility,
    accent: row.accent,
    position: row.position,
    chapters: row.chapters.length,
    lessons: lessons.length,
    seconds: lessons.reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0),
    progress: percent(completed, lessons.length),
    completed,
  };
}

/** Which lessons this person has finished. One query, used by everything below. */
async function completedLessonIds(userId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, completedAt: { not: null } },
    select: { lessonId: true },
  });
  return new Set(rows.map((row) => row.lessonId));
}

/**
 * The grid a student sees: published courses only, each with their own percentage.
 *
 * An admin looking at `/courses` sees the hidden ones too, marked as such — they are
 * the person who hid them, and being able to check the student view without publishing
 * is the point.
 */
export async function listCourses(actor: Actor, hubId: string): Promise<CourseCard[]> {
  const admin = isAdmin(actor);
  const [rows, done] = await Promise.all([
    prisma.course.findMany({
      where: admin ? { hubId } : { hubId, visibility: VISIBILITY.PUBLISHED },
      orderBy: { position: "asc" },
      select: GRID_SELECT,
    }),
    completedLessonIds(actor.userId),
  ]);
  return rows.map((row) => toCard(row, done));
}

/** The manage grid. Every course, published or not, in the order they are dragged into. */
export async function listCoursesForAdmin(hubId: string): Promise<CourseCard[]> {
  const rows = await prisma.course.findMany({
    where: { hubId },
    orderBy: { position: "asc" },
    select: GRID_SELECT,
  });
  return rows.map((row) => toCard(row, new Set()));
}

/* ------------------------------------------------------------------- the player -- */

export type PlayerProgress = {
  /** Lesson ids this person has finished. */
  done: Set<string>;
  /** Lesson id → seconds watched, for resuming an uploaded video where they left it. */
  watched: Map<string, number>;
  /**
   * Lesson id → the day it opens, for anything drip-fed that has not come round yet.
   *
   * Decided here rather than in the pages, and against one clock read for the whole
   * request: the sidebar, the player and the "continue" button must agree about what
   * is open, and three separate `Date.now()` calls mid-render is how they would come
   * to disagree. Empty for an admin, who is never held back by drip.
   */
  locked: Map<string, Date>;
};

export type PlayerCourse = {
  tree: CourseTree;
  progress: PlayerProgress;
  /** Whole percent across every lesson in the course. */
  percent: number;
  lessons: number;
  completed: number;
};

/**
 * A course as a student opens it, with their own progress attached.
 *
 * A hidden course 404s for them rather than redirecting, so the app never confirms
 * that a course they cannot see exists.
 */
export async function loadCourseForStudent(
  slug: string,
  hubId: string,
  actor: Actor,
): Promise<PlayerCourse> {
  const course = await prisma.course.findFirst({
    where: { slug, hubId },
    select: { id: true, visibility: true },
  });
  if (!course) notFound();
  if (course.visibility !== VISIBILITY.PUBLISHED && !isAdmin(actor)) notFound();

  const [tree, rows] = await Promise.all([
    loadTree(course.id, hubId),
    prisma.lessonProgress.findMany({
      where: { userId: actor.userId, lesson: { chapter: { courseId: course.id } } },
      select: { lessonId: true, completedAt: true, secondsWatched: true },
    }),
  ]);

  const done = new Set<string>();
  const watched = new Map<string, number>();
  for (const row of rows) {
    if (row.completedAt) done.add(row.lessonId);
    if (row.secondsWatched > 0) watched.set(row.lessonId, row.secondsWatched);
  }

  const now = Date.now();
  const locked = new Map<string, Date>();
  if (!isAdmin(actor)) {
    for (const chapter of tree.chapters) {
      for (const lesson of chapter.lessons) {
        const opens = dripUnlocksAt(lesson.dripDays, actor.joinedAt);
        if (opens && opens.getTime() > now) locked.set(lesson.id, opens);
      }
    }
  }

  const lessons = tree.chapters.reduce((sum, c) => sum + c.lessons.length, 0);
  const completed = tree.chapters.reduce(
    (sum, chapter) =>
      sum + chapter.lessons.filter((lesson) => done.has(lesson.id)).length,
    0,
  );

  return {
    tree,
    progress: { done, watched, locked },
    percent: percent(completed, lessons),
    lessons,
    completed,
  };
}

/* -------------------------------------------------------------------- the roster -- */

export type { StudentRow } from "./catalog-types";

/**
 * Every account, with how far through the library each one is.
 *
 * Only published courses count toward a student's figure. A course still being built
 * would otherwise drag everybody's percentage down the moment a chapter was added to
 * it, which is not what "55% through the training" is meant to mean.
 */
export async function roster(hubId: string): Promise<StudentRow[]> {
  const [users, courses, completions] = await Promise.all([
    prisma.user.findMany({
      // The people of this hub, plus whoever runs every hub — an owner or a
      // cross-offer admin belongs on each roster they can reach.
      where: { OR: [{ hubId }, { hubId: null }] },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastSeenAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.course.findMany({
      where: { hubId, visibility: VISIBILITY.PUBLISHED },
      select: {
        id: true,
        chapters: { select: { lessons: { select: { id: true } } } },
      },
    }),
    prisma.lessonProgress.findMany({
      where: { completedAt: { not: null }, lesson: { chapter: { course: { hubId } } } },
      select: { userId: true, lessonId: true },
    }),
  ]);

  // lesson id → course id, so a completion can be counted against the right course
  // without a second query per student.
  const lessonCourse = new Map<string, string>();
  const courseTotals = new Map<string, number>();
  for (const course of courses) {
    const ids = course.chapters.flatMap((chapter) => chapter.lessons.map((l) => l.id));
    courseTotals.set(course.id, ids.length);
    for (const id of ids) lessonCourse.set(id, course.id);
  }
  const totalLessons = lessonCourse.size;

  const byUser = new Map<string, Map<string, number>>();
  for (const row of completions) {
    const courseId = lessonCourse.get(row.lessonId);
    // A completion on a hidden or deleted course is simply not counted.
    if (!courseId) continue;
    const counts = byUser.get(row.userId) ?? new Map<string, number>();
    counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
    byUser.set(row.userId, counts);
  }

  return users.map((user) => {
    const counts = byUser.get(user.id) ?? new Map<string, number>();
    let completed = 0;
    let coursesDone = 0;
    for (const [courseId, count] of counts) {
      completed += count;
      const total = courseTotals.get(courseId) ?? 0;
      if (total > 0 && count >= total) coursesDone += 1;
    }
    return {
      ...user,
      percent: percent(completed, totalLessons),
      completed,
      lessons: totalLessons,
      coursesDone,
    };
  });
}

export type StudentCourseRow = {
  courseId: string;
  title: string;
  slug: string;
  accent: string;
  visibility: string;
  lessons: number;
  completed: number;
  percent: number;
  lastActivity: Date | null;
};

export type StudentDetail = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    lastSeenAt: Date | null;
    lastActiveAt: Date | null;
  };
  courses: StudentCourseRow[];
  percent: number;
  completed: number;
  lessons: number;
};

/** One person, course by course — what the students tab opens onto. */
export async function studentDetail(
  userId: string,
  hubId: string,
): Promise<StudentDetail> {
  const user = await prisma.user.findFirst({
    // Their own hub, or nobody's — an owner viewed from inside a hub is fine, an
    // account from another offer is a 404.
    where: { id: userId, OR: [{ hubId }, { hubId: null }] },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastSeenAt: true,
      lastActiveAt: true,
    },
  });
  if (!user) notFound();

  const [courses, rows] = await Promise.all([
    prisma.course.findMany({
      where: { hubId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        accent: true,
        visibility: true,
        chapters: { select: { lessons: { select: { id: true } } } },
      },
    }),
    prisma.lessonProgress.findMany({
      where: {
        userId,
        completedAt: { not: null },
        lesson: { chapter: { course: { hubId } } },
      },
      select: { lessonId: true, completedAt: true },
    }),
  ]);

  const doneAt = new Map(rows.map((row) => [row.lessonId, row.completedAt]));

  let completed = 0;
  let lessons = 0;

  const detail = courses.map((course) => {
    const ids = course.chapters.flatMap((chapter) => chapter.lessons.map((l) => l.id));
    const mine = ids.filter((id) => doneAt.has(id));
    // Only published courses move the headline figure — same rule as the roster.
    if (course.visibility === VISIBILITY.PUBLISHED) {
      completed += mine.length;
      lessons += ids.length;
    }
    const last = mine
      .map((id) => doneAt.get(id))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      courseId: course.id,
      title: course.title,
      slug: course.slug,
      accent: course.accent,
      visibility: course.visibility,
      lessons: ids.length,
      completed: mine.length,
      percent: percent(mine.length, ids.length),
      lastActivity: last ?? null,
    };
  });

  return {
    user,
    courses: detail,
    percent: percent(completed, lessons),
    completed,
    lessons,
  };
}

/* ------------------------------------------------------------ the progress board -- */

export type ProgressBoard = {
  courses: { id: string; title: string; accent: string; lessons: number }[];
  students: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    /** Course id → whole percent. */
    byCourse: Record<string, number>;
    percent: number;
  }[];
};

/**
 * Everyone against every course, as one grid.
 *
 * Students only. An admin's own percentage is not a useful number and would sit at the
 * top of the table pretending to be one.
 */
export async function progressBoard(hubId: string): Promise<ProgressBoard> {
  const [courses, students, completions] = await Promise.all([
    prisma.course.findMany({
      where: { hubId, visibility: VISIBILITY.PUBLISHED },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        accent: true,
        chapters: { select: { lessons: { select: { id: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT", hubId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, isActive: true },
    }),
    prisma.lessonProgress.findMany({
      where: { completedAt: { not: null }, lesson: { chapter: { course: { hubId } } } },
      select: { userId: true, lessonId: true },
    }),
  ]);

  const lessonCourse = new Map<string, string>();
  const totals = new Map<string, number>();
  for (const course of courses) {
    const ids = course.chapters.flatMap((chapter) => chapter.lessons.map((l) => l.id));
    totals.set(course.id, ids.length);
    for (const id of ids) lessonCourse.set(id, course.id);
  }

  const byUser = new Map<string, Map<string, number>>();
  for (const row of completions) {
    const courseId = lessonCourse.get(row.lessonId);
    if (!courseId) continue;
    const counts = byUser.get(row.userId) ?? new Map<string, number>();
    counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
    byUser.set(row.userId, counts);
  }

  const allLessons = lessonCourse.size;

  return {
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      accent: course.accent,
      lessons: totals.get(course.id) ?? 0,
    })),
    students: students.map((student) => {
      const counts = byUser.get(student.id) ?? new Map<string, number>();
      const byCourse: Record<string, number> = {};
      let done = 0;
      for (const course of courses) {
        const count = counts.get(course.id) ?? 0;
        done += count;
        byCourse[course.id] = percent(count, totals.get(course.id) ?? 0);
      }
      return {
        id: student.id,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        byCourse,
        percent: percent(done, allLessons),
      };
    }),
  };
}
