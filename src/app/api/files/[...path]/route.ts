import { requireActor } from "@/lib/access";
import { serveLocalFile } from "@/lib/serve";

/**
 * Serves a file written by the local upload path — attachments, and videos when no
 * blob storage is configured.
 *
 * Behind the login, because a lesson video is the product. Range handling and the
 * refusal of `..` both live in src/lib/serve.ts, which the protected-video route uses
 * as well.
 */
/**
 * Streaming has to be allowed to take longer than a page render. Sixty seconds is the
 * ceiling on Vercel's Hobby plan and far more than a bounded chunk ever needs.
 */
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  await requireActor();
  const { path: segments } = await params;
  return serveLocalFile(segments, request);
}
