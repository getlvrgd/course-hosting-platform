import { getActor } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * The heartbeat. Every open page posts here every half minute.
 *
 * A route handler rather than a server action, because this fires on a timer forever
 * and must stay as close to nothing as possible: one UPDATE by primary key, no reads,
 * no revalidation, and a 204 with no body.
 *
 * `getActor` rather than `requireActor`: a signed-out beacon is an ordinary thing —
 * the session expired while the tab sat open — and it should get a quiet 401 rather
 * than a redirect to the login page that no one is going to look at.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });

  // Whether they were touching the page, not merely that it is open. Anything
  // unparseable counts as "open but idle", which is the safer of the two to guess.
  let active = false;
  try {
    const body = (await request.json()) as { active?: unknown };
    active = body.active === true;
  } catch {
    // Keep the default.
  }

  const now = new Date();
  await prisma.user
    .update({
      where: { id: actor.userId },
      data: { lastSeenAt: now, ...(active ? { lastActiveAt: now } : {}) },
    })
    .catch(() => {
      // A missed heartbeat is not worth a 500 in anyone's log. The next one is 30
      // seconds away, and a run of them failing is what "offline" already means.
    });

  return new Response(null, { status: 204 });
}
