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
