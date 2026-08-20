"use server";

import { revalidatePath } from "next/cache";

import { requireHubAdmin } from "@/lib/access";
import { readSettings, isDownloadMode, saveSettings } from "@/lib/settings";

/**
 * The library's own settings.
 *
 * Owner-only. An admin runs the courses and the roster; how the product is delivered —
 * and what it costs to deliver it — is the owner's call.
 */

export type SettingsState = { ok?: string; error?: string };

export async function setDownloadMode(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const slug = String(formData.get("slug") ?? "");
  const { hub } = await requireHubAdmin(slug);

  const mode = String(formData.get("downloads") ?? "");
  // Anything unrecognised is refused rather than defaulted: quietly turning protection
  // off because a form posted a typo is the wrong way to fail.
  if (!isDownloadMode(mode)) return { error: "That isn't one of the options." };

  await saveSettings(hub.id, { ...readSettings(hub.settings), downloads: mode });

  // Every lesson page in this hub picks its video URL from this, so they all have to
  // be re-read.
  revalidatePath(`/h/${slug}`, "layout");

  return {
    ok: {
      open: "Videos now play straight from storage, with the browser's own download button.",
      code: "Downloading now asks for a code, and every attempt is logged.",
      off: "Downloading is off. Videos play through this app only.",
    }[mode],
  };
}
