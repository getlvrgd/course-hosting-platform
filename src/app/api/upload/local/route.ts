import { requireAnyAdmin } from "@/lib/access";
import { blobConfigured, MAX_UPLOAD_BYTES, putLocal } from "@/lib/storage";

/**
 * The no-blob-token path: the file is posted here and written to `.uploads`.
 *
 * For building courses on a laptop before any storage is set up. It is closed as soon
 * as a blob token exists, so production never quietly falls back to writing files on a
 * disk that vanishes with the next deploy.
 */
export async function POST(request: Request) {
  await requireAnyAdmin();

  if (blobConfigured()) {
    return Response.json(
      { error: "Blob storage is configured — upload goes straight there." },
      { status: 409 },
    );
  }

  /*
   * A serverless host has no disk to write to, and the one it appears to have is
   * wiped between requests. Refusing here with something readable beats an EROFS from
   * three frames down, and beats the worse outcome: an upload that appears to work,
   * is written to /tmp, and is a broken video by the time a student opens the lesson.
   *
   * `VERCEL` is set on every Vercel build and runtime; UPLOAD_DIR is the escape hatch
   * for a host that genuinely does have a persistent disk mounted somewhere.
   */
  if (process.env.VERCEL && !process.env.UPLOAD_DIR) {
    return Response.json(
      {
        error:
          "This deployment has nowhere to keep uploads. Add Blob storage and set BLOB_READ_WRITE_TOKEN, then try again.",
      },
      { status: 501 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was sent." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is too large." }, { status: 413 });
  }

  return Response.json(await putLocal(file));
}
