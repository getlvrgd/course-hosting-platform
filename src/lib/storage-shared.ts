/**
 * The two facts about storage that both sides need.
 *
 * Split out of src/lib/storage.ts because that file is `server-only` — it opens the
 * filesystem — and the browser still has to know what a stored file looks like and
 * which folder to ask for.
 */

export const UPLOAD_PREFIX = "lessons";

export type StoredFile = {
  url: string;
  name: string;
  size: number;
  type: string;
};
