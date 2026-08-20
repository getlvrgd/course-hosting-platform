import { requireActor } from "@/lib/access";
import { isAdmin } from "@/lib/auth";
import { dripUnlocksAt } from "@/lib/course";
import { prisma } from "@/lib/db";
import { VISIBILITY } from "@/lib/options";
import { ticketAllows } from "@/lib/downloads";
import { proxyRemoteFile, serveLocalFile } from "@/lib/serve";

/**
 * An uploaded video, served through this app instead of straight from storage.
 *
 * This is what the "protect videos" setting actually buys. Blob storage hands out
 * public, permanent URLs — that is how a CDN is fast — so with protection off the page
 * carries that URL and anyone who copies it out of the network tab can pass it to the
 * world. With protection on the page never contains it: it points here instead, and
 * every request is checked against a session, the course's visibility, and the lesson's
 * drip date. A copied link is then worth nothing to anyone without an account.
 *
 * The cost is real and is why this is a setting rather than the default: every byte of
 * every video now travels through a function instead of off a CDN edge. Turn it on for
 * a paid course; leave it off for a free one.
 *
 * This route is always available and always checked. The setting decides whether the
 * *page* points at it or at storage directly — so nothing here needs to read the
 * setting, and turning protection off never leaves a hole open.
 *
 * What it does **not** do is stop a determined person. Anyone who can watch a video can
 * record their screen, and no amount of this changes that. It raises the bar from
 * "right-click, Save as" to "deliberately set out to rip it", which is the honest
 * ceiling for anything short of DRM.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const actor = await requireActor();
  const { lessonId } = await params;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      videoKind: true,
      videoUrl: true,
      videoName: true,
      dripDays: true,
      chapter: { select: { course: { select: { visibility: true, hubId: true } } } },
    },
  });
  // Only uploads come through here. An embed is played by its own host, and a lesson
  // with no video has nothing to serve.
  if (!lesson || lesson.videoKind !== "FILE" || !lesson.videoUrl) {
    return new Response("Not found", { status: 404 });
  }

  const admin = isAdmin(actor);

  // The same rules the lesson page enforces, applied again here. A route that streams
  // the product cannot rely on the page in front of it having checked.
  //
  // The hub comes first: a student of one offer holding a lesson id from another gets
  // the same answer as a stranger.
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

  /*
   * A ticket turns this from playback into a download.
   *
   * It is minted by `requestDownload` only after a code has been checked and the
   * attempt written to the log, and it is signed for this person and this lesson with
   * a few minutes on it — so the URL cannot be passed to somebody else or kept. Without
   * one, the response is a stream to play and nothing else.
   */
  const ticket = new URL(request.url).searchParams.get("dl");
  const download = ticket
    ? await ticketAllows(ticket, actor.userId, lessonId)
    : false;

  const filename = (lesson.videoName ?? "lesson.mp4").replace(/["\\]/g, "");
  const headers = {
    // `inline` is belt and braces with the player's own controls: it tells the browser
    // to play this rather than offer it as a file.
    "Content-Disposition": download
      ? `attachment; filename="${filename}"`
      : "inline",
    "X-Content-Type-Options": "nosniff",
  };

  // A local upload is on this machine's disk; anything else is in blob storage.
  const local = lesson.videoUrl.match(/^\/api\/files\/(.+)$/);
  if (local) {
    return serveLocalFile(local[1].split("/"), request, headers);
  }
  return proxyRemoteFile(lesson.videoUrl, request, headers);
}
