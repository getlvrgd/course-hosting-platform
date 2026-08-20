import { requireActor } from "@/lib/access";
import { isAdmin } from "@/lib/auth";
import { dripUnlocksAt, parseAttachments } from "@/lib/course";
import { prisma } from "@/lib/db";
import { VISIBILITY } from "@/lib/options";
import { proxyRemoteFile, serveLocalFile } from "@/lib/serve";

/**
 * A lesson's attachment — the workbook, the swipe file, the slides.
 *
 * Through this app rather than by its storage URL, because files are kept privately
 * and that URL answers 403 to a browser. The same checks the lesson page makes are
 * made again here: a route that hands out the material cannot rely on the page in
 * front of it having looked.
 *
 * Attachments are meant to be downloaded — that is what a workbook is for — so this
 * always answers as a download, and the download settings do not apply to it.
 */
/**
 * Streaming has to be allowed to take longer than a page render. Sixty seconds is the
 * ceiling on Vercel's Hobby plan and far more than a bounded chunk ever needs.
 */
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; attachmentId: string }> },
) {
  const actor = await requireActor();
  const { lessonId, attachmentId } = await params;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      attachments: true,
      dripDays: true,
      chapter: { select: { course: { select: { visibility: true, hubId: true } } } },
    },
  });
  if (!lesson) return new Response("Not found", { status: 404 });

  const admin = isAdmin(actor);
  if (!admin && actor.hubId !== lesson.chapter.course.hubId) {
    return new Response("Not found", { status: 404 });
  }
  if (lesson.chapter.course.visibility !== VISIBILITY.PUBLISHED && !admin) {
    return new Response("Not found", { status: 404 });
  }
  if (!admin) {
    const opens = dripUnlocksAt(lesson.dripDays, actor.joinedAt);
    if (opens && opens.getTime() > Date.now()) {
      return new Response("Not found", { status: 404 });
    }
  }

  const file = parseAttachments(lesson.attachments).find(
    (row) => row.id === attachmentId,
  );
  if (!file) return new Response("Not found", { status: 404 });

  const name = file.name.replace(/["\\]/g, "");
  const headers = {
    "Content-Disposition": `attachment; filename="${name}"`,
    "X-Content-Type-Options": "nosniff",
  };

  const local = file.url.match(/^\/api\/files\/(.+)$/);
  if (local) return serveLocalFile(local[1].split("/"), request, headers);
  return proxyRemoteFile(file.url, request, headers);
}
