import "server-only";

import { notFound, redirect } from "next/navigation";

import { getActor, isAdmin, isOwner, type Actor } from "./auth";
import { prisma } from "./db";
import { STATUS } from "./options";

/**
 * Who is allowed to see and do what.
 *
 * Three rules, enforced here rather than in each page:
 *
 *   1. **`hubId` is what bounds someone.** A student carries one and can only ever
 *      reach that hub; the owner and an unscoped admin carry none and reach the
 *      directory and every hub in it. An admin *given* a hubId is bounded by it
 *      exactly as a student is, which is how an offer gets its own manager.
 *   2. **A hub that is not yours does not exist.** Asking for one answers 404, never a
 *      redirect, so the app never confirms that some other offer is there.
 *   3. **What changes the shape of the business** — creating an offer, deleting one —
 *      is the owner's alone, however far an admin otherwise reaches.
 *
 * Hiding a link is never the control; these functions are. Every page and every server
 * action starts by calling one of them, so a crafted URL or a replayed form post lands
 * on the same check as a click in the UI.
 */

/**
 * Reaches every offer rather than one.
 *
 * The owner always. An admin only while they carry no hub of their own — attach one
 * and they become that offer's manager and nothing more.
 */
export const spansHubs = (who: { role: string; hubId: string | null }) =>
  isOwner(who) || (isAdmin(who) && who.hubId === null);

export type HubRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  accent: string;
  status: string;
  position: number;
  settings: unknown;
  updatedAt: Date;
};

export type HubContext = {
  actor: Actor;
  hub: HubRecord;
  /** True when this person may edit the hub — owner and admin only. */
  canEdit: boolean;
};

const HUB_FIELDS = {
  id: true,
  name: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  accent: true,
  status: true,
  position: true,
  settings: true,
  updatedAt: true,
} as const;

/** Signed in, or off to the login page. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/**
 * Signed in as an admin of *something*, without naming which hub.
 *
 * For the upload endpoints, where the file is not yet attached to anything and so
 * there is no hub to check it against. Whether the finished lesson belongs to a hub
 * this person may edit is settled by `saveLesson`, which is the write that matters.
 */
export async function requireAnyAdmin(): Promise<Actor> {
  const actor = await requireActor();
  if (!isAdmin(actor)) redirect(await homePathFor(actor));
  return actor;
}

/**
 * Signed in as somebody who works across offers, or bounced to where they do belong.
 *
 * Guards the directory. The owner and an unscoped admin both belong here; what
 * separates them is what the directory lets them *do*, which is decided on the page.
 */
export async function requireGlobal(): Promise<Actor> {
  const actor = await requireActor();
  if (!spansHubs(actor)) redirect(await homePathFor(actor));
  return actor;
}

/**
 * Signed in as the owner. Guards creating and deleting an offer, neither of which an
 * admin may do.
 *
 * The owner-only button being hidden from admins is a courtesy, not the control — a
 * replayed form post from an admin lands here.
 */
export async function requireOwner(): Promise<Actor> {
  const actor = await requireActor();
  if (!isOwner(actor)) redirect(await homePathFor(actor));
  return actor;
}

/**
 * Resolves `/h/<slug>` for the current user.
 *
 * Somebody asking for a hub that is not theirs gets a 404 rather than a redirect, so
 * the app never confirms that the other hub exists.
 */
export async function requireHub(slug: string): Promise<HubContext> {
  const actor = await requireActor();

  const hub = await prisma.hub.findUnique({
    where: { slug },
    select: HUB_FIELDS,
  });
  if (!hub) notFound();

  // An admin bound to a hub is bounded by it exactly as the students are, so this
  // comes before the admin question rather than after it.
  if (!spansHubs(actor) && actor.hubId !== hub.id) notFound();
  const admin = isAdmin(actor);

  // A draft offer is not open yet and an archived one is out of circulation, so both
  // close to their students — otherwise somebody with the URL bookmarked would carry
  // on working an offer that has been retired. Admins keep access, because they are
  // the ones deciding what happens to it.
  if (hub.status !== STATUS.LIVE && !admin) notFound();

  return { actor, hub, canEdit: admin };
}

/** As `requireHub`, but only an owner or admin gets through. */
export async function requireHubAdmin(slug: string): Promise<HubContext> {
  const context = await requireHub(slug);
  if (!context.canEdit) notFound();
  return context;
}

/**
 * The hub a server action is acting on, resolved from an id in the form body and
 * verified against the session rather than trusted.
 */
export async function resolveHubAction(
  hubId: string,
): Promise<{ actor: Actor; hub: HubRecord }> {
  const actor = await requireActor();

  const hub = await prisma.hub.findUnique({ where: { id: hubId }, select: HUB_FIELDS });
  if (!hub) notFound();
  if (!spansHubs(actor) && actor.hubId !== hub.id) notFound();
  if (hub.status !== STATUS.LIVE && !isAdmin(actor)) notFound();

  return { actor, hub };
}

/** The same, for an action that only an admin of that hub may run. */
export async function resolveHubAdminAction(hubId: string) {
  const resolved = await resolveHubAction(hubId);
  if (!isAdmin(resolved.actor)) notFound();
  return resolved;
}

/**
 * Stamps "last seen" without making every page wait on the write.
 *
 * Throttled to once an hour, because the students tab wants "was this person here this
 * week", not a click counter. Real-time presence comes from the heartbeat instead.
 */
export async function touchLastSeen(actor: Actor) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.user
    .updateMany({
      where: {
        id: actor.userId,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: hourAgo } }],
      },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      // A failed heartbeat must never take a page down with it.
    });
}

/** Where somebody should land after signing in. */
export async function homePathFor(who: {
  role: string;
  hubId: string | null;
}): Promise<string> {
  // Whoever works across offers lands in the directory of them.
  if (spansHubs(who)) return "/hub";
  if (!who.hubId) return "/no-hub";

  const hub = await prisma.hub.findUnique({
    where: { id: who.hubId },
    select: { slug: true, status: true },
  });
  if (!hub) return "/no-hub";

  const admin = isAdmin(who);
  // A draft or archived offer is closed to its students but not to the admin running
  // it — they are the one who has to be able to open or finish it.
  if (hub.status !== STATUS.LIVE && !admin) return "/no-hub";

  return admin ? `/h/${hub.slug}/manage` : `/h/${hub.slug}`;
}

/** True when nobody has been created yet — first run sends you to /setup. */
export async function needsSetup() {
  const count = await prisma.user.count();
  return count === 0;
}
