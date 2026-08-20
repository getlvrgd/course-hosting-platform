"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActor, requireHubAdmin } from "@/lib/access";
import { isAdmin } from "@/lib/auth";
import { dripUnlocksAt } from "@/lib/course";
import { prisma } from "@/lib/db";
import {
  hashCode,
  hintOf,
  isRateLimited,
  logAttempt,
  mintTicket,
  newDownloadCode,
  normaliseCode,
  OUTCOMES,
  type Outcome,
} from "@/lib/downloads";
import { VISIBILITY } from "@/lib/options";
import { DOWNLOAD_MODES, readSettings } from "@/lib/settings";

/**
 * Asking to download a video, and the codes that answer.
 *
 * Every path through `requestDownload` writes a row — that is the feature. A refusal is
 * more interesting than a success, so the log is not something that happens after the
 * good case; it is the thing the good and bad cases have in common.
 */

/* ------------------------------------------------------------------ the request -- */

/**
 * The lesson, and whether this person is allowed near it at all.
 *
 * Shared by the two entry points so the intent log cannot be used to write rows about
 * lessons somebody cannot reach — a log full of noise anyone can generate is worse
 * than no log.
 */
async function reachableLesson(
  lessonId: string,
  actor: { userId: string; role: string; hubId: string | null; joinedAt: Date },
) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      videoKind: true,
      videoUrl: true,
      dripDays: true,
      chapter: {
        select: {
          course: {
            select: {
              title: true,
              visibility: true,
              hubId: true,
              hub: { select: { settings: true } },
            },
          },
        },
      },
    },
  });
  if (!lesson || lesson.videoKind !== "FILE" || !lesson.videoUrl) return null;

  const admin = isAdmin(actor);
  // A lesson in another offer is not theirs, whatever their role in their own.
  if (!admin && actor.hubId !== lesson.chapter.course.hubId) return null;
  if (lesson.chapter.course.visibility !== VISIBILITY.PUBLISHED && !admin) return null;
  if (!admin) {
    const opens = dripUnlocksAt(lesson.dripDays, actor.joinedAt);
    if (opens && opens.getTime() > Date.now()) return null;
  }
  return lesson;
}

/**
 * Somebody pressed Download.
 *
 * Written the moment the menu item is clicked — before the box opens, before a code is
 * typed, and whether or not one ever is. Someone who looks at the prompt and backs out
 * leaves no other trace, and that is precisely the person the owner asked to be able
 * to see.
 *
 * Deliberately returns nothing. It is a note in a ledger, not a permission, and the
 * button must not wait on it.
 */
export async function noteDownloadIntent(lessonId: string) {
  const actor = await requireActor();
  const lesson = await reachableLesson(lessonId, actor);
  if (!lesson) return;

  await logAttempt({
    hubId: lesson.chapter.course.hubId,
    actor: { userId: actor.userId, name: actor.name, email: actor.email },
    lesson: {
      id: lesson.id,
      title: lesson.title,
      course: lesson.chapter.course.title,
    },
    outcome: OUTCOMES.OPENED,
  });
}

export type DownloadState = {
  /** Where to send the browser when a code was accepted. */
  url?: string;
  error?: string;
};

export async function requestDownload(
  _prev: DownloadState,
  formData: FormData,
): Promise<DownloadState> {
  const actor = await requireActor();
  const lessonId = String(formData.get("lessonId") ?? "");
  const entered = String(formData.get("code") ?? "");

  // The same reachability rules the lesson page enforces. Someone who cannot watch a
  // lesson cannot download it, code or no code.
  const lesson = await reachableLesson(lessonId, actor);
  if (!lesson) {
    return { error: "There is nothing to download on this lesson." };
  }

  const admin = isAdmin(actor);
  const context = {
    id: lesson.id,
    title: lesson.title,
    course: lesson.chapter.course.title,
  };
  const who = { userId: actor.userId, name: actor.name, email: actor.email };

  const hubId = lesson.chapter.course.hubId;
  const grant = async (outcome: Outcome, codeId?: string) => {
    await logAttempt({ hubId, actor: who, lesson: context, outcome, codeId });
    return {
      url: `/api/watch/${lesson.id}?dl=${await mintTicket(actor.userId, lesson.id)}`,
    };
  };
  const refuse = async (outcome: Outcome, message: string, codeId?: string) => {
    await logAttempt({ hubId, actor: who, lesson: context, outcome, codeId });
    return { error: message };
  };

  const { downloads } = readSettings(lesson.chapter.course.hub.settings);
  if (downloads === DOWNLOAD_MODES.OFF && !admin) {
    return refuse(OUTCOMES.BLOCKED, "Downloads are turned off.");
  }

  // Whoever runs the place does not ask themselves for a code — but it is still
  // written down, because "nobody downloaded it except an admin" is only worth
  // anything if the admins are in the list too.
  if (admin) return grant(OUTCOMES.ADMIN);

  if (await isRateLimited(actor.userId)) {
    return refuse(
      OUTCOMES.BLOCKED,
      "Too many wrong codes. Try again in ten minutes.",
    );
  }

  if (!normaliseCode(entered)) {
    return refuse(OUTCOMES.NO_CODE, "Enter the code you were given.");
  }

  // Scoped to this hub: a code minted for one offer must not open another's videos.
  const code = await prisma.downloadCode.findFirst({
    where: { codeHash: hashCode(entered), hubId },
  });
  if (!code) {
    // Deliberately the same wording as an expired or spent code: a stranger guessing
    // should not learn which of their guesses was once a real code.
    return refuse(OUTCOMES.WRONG_CODE, "That code isn't valid.");
  }
  if (code.revokedAt) {
    return refuse(OUTCOMES.REVOKED, "That code isn't valid.", code.id);
  }
  if (code.expiresAt && code.expiresAt.getTime() < Date.now()) {
    return refuse(OUTCOMES.EXPIRED, "That code isn't valid.", code.id);
  }
  if (code.maxUses !== null && code.usedCount >= code.maxUses) {
    return refuse(OUTCOMES.EXHAUSTED, "That code isn't valid.", code.id);
  }

  // Spent conditionally, so two people racing the last use of a one-time code cannot
  // both get through: the second update matches no row and is refused.
  if (code.maxUses !== null) {
    const spent = await prisma.downloadCode.updateMany({
      where: { id: code.id, usedCount: { lt: code.maxUses } },
      data: { usedCount: { increment: 1 } },
    });
    if (spent.count === 0) {
      return refuse(OUTCOMES.EXHAUSTED, "That code isn't valid.", code.id);
    }
  } else {
    await prisma.downloadCode.update({
      where: { id: code.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  return grant(OUTCOMES.GRANTED, code.id);
}

/* ------------------------------------------------------------------- the codes -- */

export type CodeState = { error?: string; created?: string };

const CodeSchema = z.object({
  label: z.string().trim().min(1, "Say who it's for").max(80),
  maxUses: z.number().int().min(0).max(1000),
  days: z.number().int().min(0).max(365),
});

/** Mints a code. Shown once, here, and never legible again. */
export async function createCode(
  _prev: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);

  const parsed = CodeSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    maxUses: Number(formData.get("maxUses") ?? 1),
    days: Number(formData.get("days") ?? 0),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { label, maxUses, days } = parsed.data;

  const code = newDownloadCode();
  await prisma.downloadCode.create({
    data: {
      hubId: hub.id,
      label,
      codeHash: hashCode(code),
      hint: hintOf(code),
      // Zero means "as many as they like" in both boxes, which is the plainest reading
      // of leaving a limit blank.
      maxUses: maxUses > 0 ? maxUses : null,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
      createdById: actor.userId,
    },
  });

  revalidatePath(`/h/${slug}/settings`);
  // Returned once so it can be copied and sent. Only its hash is stored.
  return { created: code };
}

export async function revokeCode(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { hub } = await requireHubAdmin(slug);

  const id = String(formData.get("codeId") ?? "");
  // Withdrawn rather than deleted, so the attempts that used it still read. Bounded by
  // the hub, so a code id from another offer matches nothing.
  await prisma.downloadCode.updateMany({
    where: { id, hubId: hub.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/h/${slug}/settings`);
}
