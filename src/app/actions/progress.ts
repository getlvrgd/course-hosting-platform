"use server";

import { requireActor } from "@/lib/access";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * What a student has watched.
 *
 * Every action here writes the caller's own row and nobody else's — the user id comes
 * from the session, never from the form. There is deliberately no admin action for
 * marking someone else's lesson complete: the numbers on the students tab are only
 * worth reading if the only thing that can move them is somebody actually watching.
 */

/** The lesson exists and its course is one this person may reach. */
async function reachable(lessonId: string, actor: { role: string; hubId: string | null }) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      chapter: { select: { course: { select: { visibility: true, hubId: true } } } },
    },
  });
  if (!lesson) return false;

  const admin = isAdmin(actor);
  // A lesson in somebody else's offer is not theirs to tick off.
  if (!admin && actor.hubId !== lesson.chapter.course.hubId) return false;
  if (lesson.chapter.course.visibility === "PUBLISHED") return true;
  // An admin previewing a hidden course can tick through it; a student cannot reach it
  // at all, so a crafted post must not write a row either.
  return admin;
}

/**
 * Marks a lesson finished, or unfinished.
 *
 * Upserted rather than inserted, because the same lesson is completed, un-ticked and
 * completed again often enough that a failed insert would be an ordinary event.
 */
export async function setLessonComplete(lessonId: string, complete: boolean) {
  const actor = await requireActor();
  if (!(await reachable(lessonId, actor))) return { ok: false };

  const completedAt = complete ? new Date() : null;
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: actor.userId, lessonId } },
    create: { userId: actor.userId, lessonId, completedAt },
    update: { completedAt },
  });

  return { ok: true };
}

/**
 * How far into an uploaded video they got.
 *
 * Sent every few seconds while a video plays, so it is deliberately cheap: one upsert,
 * no reads, and the seconds only ever move forward — scrubbing back to re-watch a
 * passage must not lose the furthest point they had reached.
 *
 * Crossing the threshold completes the lesson here rather than in the browser, so the
 * completion is decided by the same code for everyone regardless of what the page
 * sends.
 */
export async function recordWatched(
  lessonId: string,
  seconds: number,
  duration: number,
) {
  const actor = await requireActor();
  if (!(await reachable(lessonId, actor))) return { ok: false, complete: false };

  // Both figures come off the page, so neither is trusted to be a sane number: a
  // crafted call sending NaN or a string would otherwise write junk into the row that
  // decides where this person resumes.
  const watched = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const length = Number.isFinite(duration) ? duration : 0;
  // 90% rather than the very end: credits, an outro and a viewer who clicks away at
  // the last sentence are all still "watched it".
  const finished = length > 0 && watched >= length * 0.9;

  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: actor.userId, lessonId } },
    select: { secondsWatched: true, completedAt: true },
  });

  const completedAt = existing?.completedAt ?? (finished ? new Date() : null);
  const secondsWatched = Math.max(existing?.secondsWatched ?? 0, watched);

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: actor.userId, lessonId } },
    create: { userId: actor.userId, lessonId, secondsWatched, completedAt },
    update: { secondsWatched, completedAt },
  });

  return { ok: true, complete: Boolean(completedAt) };
}
