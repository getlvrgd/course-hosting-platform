/**
 * The fixed vocabularies of the app: the three account types, course visibility, and
 * the eight tints.
 *
 * What lives here is only what the code itself branches on. Chapter titles, lesson
 * titles and course names are the owner's own words and are never checked against a
 * list.
 */

export type Option = { value: string; label: string };

/* --------------------------------------------------------------------- accounts -- */

export const ROLES = {
  /**
   * There is one owner, created by first-run setup and by nothing else — deliberately
   * absent from ACCOUNT_TYPES, so no admin can hand the role out or take it.
   */
  OWNER: "OWNER",
  /** Runs the courses and the roster. Everything the owner does but delete the owner. */
  ADMIN: "ADMIN",
  /** Watches courses and sees their own progress. Never learns the admin side exists. */
  STUDENT: "STUDENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ADMIN_ROLES: string[] = [ROLES.OWNER, ROLES.ADMIN];

/** Ask this rather than comparing against ROLES.ADMIN by hand — it misses the owner. */
export const hasAdminAccess = (role: string) => ADMIN_ROLES.includes(role);

/**
 * What the "add someone" form offers, which is not the same list as ROLES: OWNER is
 * absent, so no form and no replayed post can mint a second one.
 */
export const ACCOUNT_TYPES: Option[] = [
  { value: ROLES.STUDENT, label: "Student — watches the courses" },
  { value: ROLES.ADMIN, label: "Admin — edits courses and the roster" },
];

export const roleLabel = (role: string) =>
  ({ OWNER: "Owner", ADMIN: "Admin", STUDENT: "Student" })[role] ?? role;

/* ---------------------------------------------------------------- hub statuses -- */

export const STATUS = {
  /** Open for business: its students can sign in and work through it. */
  LIVE: "LIVE",
  /** Still being built. Admins only — its students are locked out. */
  DRAFT: "DRAFT",
  /** Retired. Closed to its students, still readable by admins. */
  ARCHIVED: "ARCHIVED",
} as const;

export type HubStatus = (typeof STATUS)[keyof typeof STATUS];

export const STATUSES: Option[] = [
  { value: STATUS.DRAFT, label: "Draft — still being built" },
  { value: STATUS.LIVE, label: "Live — students can sign in" },
  { value: STATUS.ARCHIVED, label: "Archived — no longer running" },
];

export const isHubStatus = (value: unknown): value is HubStatus =>
  value === STATUS.LIVE || value === STATUS.DRAFT || value === STATUS.ARCHIVED;

export const statusLabel = (value: string) =>
  ({ LIVE: "Live", DRAFT: "Draft", ARCHIVED: "Archived" })[value] ?? value;

/* ------------------------------------------------------------------- visibility -- */

export const VISIBILITY = {
  /** On the grid for everyone. */
  PUBLISHED: "PUBLISHED",
  /** Private: admins only, and 404 for a student who has the URL. */
  HIDDEN: "HIDDEN",
} as const;

export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const VISIBILITIES: Option[] = [
  { value: VISIBILITY.PUBLISHED, label: "Published — students can see it" },
  { value: VISIBILITY.HIDDEN, label: "Hidden — only you and your admins" },
];

export const isVisibility = (value: unknown): value is Visibility =>
  value === VISIBILITY.PUBLISHED || value === VISIBILITY.HIDDEN;

/* ------------------------------------------------------------------------ slugs -- */

/**
 * A slug that is safe in a URL and stable enough to send to a student.
 * Uniqueness is settled against the database by the caller.
 */
export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "untitled"
  );
}

/* ------------------------------------------------------------------------ tints -- */

/**
 * The eight pastels a course can wear — the same eight the content hub puts on its
 * cards and the sales dashboard puts on its tiles, so the products look like one
 * system.
 *
 * Each resolves to three CSS variables in globals.css: a pale fill, a matching edge,
 * and a stronger outline. Dark mode has its own separately chosen steps rather than an
 * automatic inversion.
 */
export const TINTS: Option[] = [
  { value: "blue", label: "Blue" },
  { value: "aqua", label: "Aqua" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "red", label: "Red" },
  { value: "magenta", label: "Pink" },
  { value: "violet", label: "Violet" },
];

const TINT_VALUES = new Set(TINTS.map((tint) => tint.value));

/**
 * Guards the interpolation into `var(--tile-…)`.
 *
 * The value reaches here from a stored course, so it is user input landing in a style
 * attribute. Anything not on the list is treated as no colour at all.
 */
export const isTint = (value: unknown): value is string =>
  typeof value === "string" && TINT_VALUES.has(value);

/** The three custom properties a tint resolves to. Returns null for "no tint". */
export function tintVars(value: unknown) {
  if (!isTint(value)) return null;
  return {
    fill: `var(--tile-${value})`,
    edge: `var(--tile-${value}-edge)`,
    outline: `var(--tile-${value}-outline)`,
  };
}
