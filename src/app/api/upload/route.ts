import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { requireAnyAdmin } from "@/lib/access";
import { blobConfigured, MAX_UPLOAD_BYTES, UPLOAD_PREFIX } from "@/lib/storage";

/**
 * The token exchange for a direct-to-blob upload.
 *
 * The file itself never passes through this app. The browser asks here for a
 * short-lived token, uploads straight to blob storage with it, and comes back with a
 * URL — which is the only way a 900MB lesson video can be uploaded at all, since a
 * serverless function caps a request body at a few megabytes.
 *
 * The check that matters is the first line: only an admin is ever handed a token.
 */
export async function POST(request: Request) {
  await requireAnyAdmin();

  if (!blobConfigured()) {
    return Response.json(
      { error: "Blob storage isn't configured. Set BLOB_READ_WRITE_TOKEN." },
      { status: 501 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Deliberately open: "every video format" is the ask, and refusing a .mkv here
        // would be this app deciding what a course may contain. What a browser can
        // actually play is the player's problem, and it offers a download either way.
        allowedContentTypes: undefined,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        // Two people uploading `final.mp4` on the same afternoon must not collide.
        addRandomSuffix: true,
        pathname: UPLOAD_PREFIX,
      }),
      onUploadCompleted: async () => {
        // Nothing to do: the lesson row is written by the editor's own save once the
        // browser has the URL, so there is no second source of truth to reconcile.
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
