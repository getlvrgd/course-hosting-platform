import "server-only";

import { prisma } from "./db";

/**
 * Settings that belong to one hub rather than to one course.
 *
 * Per hub, not app-wide: one offer being a paid course whose videos need protecting
 * says nothing about another that is free, and the owner runs both.
 *
 * Stored as a single JSON document on the Hub row, read whole and written whole. There
 * is one editor for these — an admin, on a form — so there is no concurrent write to
 * lose, and a new setting can be added here without a migration.
 *
 * Every field has a default in code, so a hub that has never opened the settings page
 * behaves exactly like one that has.
 */

/**
 * What a student may do with an uploaded video.
 *
 * One field rather than several flags, because the three answers are exclusive and two
 * booleans would let someone express a fourth state that means nothing.
 */
export const DOWNLOAD_MODES = {
  /**
   * Plays straight from storage, with the browser's own save button. Cheapest —
   * playback comes off a CDN and never touches this app.
   */
  OPEN: "open",
  /**
   * Plays through this app, and the save button is replaced by one that asks for a
   * code the owner issues. Every press is logged, granted or not.
   */
  CODE: "code",
  /** Plays through this app, and there is no download at all. */
  OFF: "off",
} as const;

export type DownloadMode = (typeof DOWNLOAD_MODES)[keyof typeof DOWNLOAD_MODES];

export const isDownloadMode = (value: unknown): value is DownloadMode =>
  value === "open" || value === "code" || value === "off";

/** True for the two modes where the storage URL must not reach the page. */
export const isProtected = (mode: DownloadMode) => mode !== DOWNLOAD_MODES.OPEN;

export type LibrarySettings = {
  downloads: DownloadMode;
};

const DEFAULTS: LibrarySettings = {
  downloads: DOWNLOAD_MODES.OPEN,
};

/**
 * Reads the document back, filling in anything an older write did not have.
 *
 * Takes the stored JSON rather than fetching it, because every caller has already
 * loaded the hub — asking again would be a second query for a column already in hand.
 *
 * `protectVideos` was the first shape of this setting, a plain boolean. A hub written
 * before the three modes existed is read forward here rather than migrated, so there
 * is no data step to remember and no window where the setting reads as its default.
 */
export function readSettings(stored: unknown): LibrarySettings {
  if (typeof stored !== "object" || stored === null) return DEFAULTS;

  const value = stored as Record<string, unknown>;
  if (isDownloadMode(value.downloads)) return { downloads: value.downloads };
  if (typeof value.protectVideos === "boolean") {
    return {
      downloads: value.protectVideos ? DOWNLOAD_MODES.OFF : DOWNLOAD_MODES.OPEN,
    };
  }
  return DEFAULTS;
}

/** For the few callers that have only an id — a route handler, mostly. */
export async function getSettings(hubId: string): Promise<LibrarySettings> {
  const hub = await prisma.hub.findUnique({
    where: { id: hubId },
    select: { settings: true },
  });
  return readSettings(hub?.settings);
}

export async function saveSettings(hubId: string, next: LibrarySettings) {
  await prisma.hub.update({ where: { id: hubId }, data: { settings: next } });
}
