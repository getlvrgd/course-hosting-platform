"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { requireGlobal, requireHubAdmin, requireOwner } from "@/lib/access";
import { isOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isHubStatus, isTint, slugify, STATUS } from "@/lib/options";
import { DOWNLOAD_MODES } from "@/lib/settings";

/**
 * The offers themselves.
 *
 * Creating and deleting one is the owner's alone — those are the two things that change
 * the shape of the business, and an admin who runs an offer day to day should not be
 * able to invent another or wipe one. Editing a hub's own fields is any admin's.
 */

export type HubState = { error?: string; ok?: string };

const HubSchema = z.object({
  name: z.string().trim().min(1, "Give the offer a name").max(80),
});

/** A slug nobody else is using. */
async function freeSlug(desired: string, exceptId?: string) {
  const base = slugify(desired);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.hub.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * A new offer, ready to work in.
 *
 * It arrives furnished rather than empty: a first course, a first chapter, and the
 * settings every hub starts with. Pressing `+` and landing on a blank page is the
 * moment where you have to remember how this all goes together — so it does not
 * happen. Everything made here is ordinary and can be renamed or deleted.
 *
 * DRAFT, and the course inside it hidden, because an offer becomes visible to students
 * when somebody decides it is ready, never because it was created.
 */
export async function createHub(
  _prev: HubState,
  formData: FormData,
): Promise<HubState> {
  await requireOwner();

  const parsed = HubSchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { name } = parsed.data;

  const last = await prisma.hub.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const hub = await prisma.hub.create({
    data: {
      name,
      slug: await freeSlug(name),
      status: STATUS.DRAFT,
      position: (last?.position ?? -1) + 1,
      settings: { downloads: DOWNLOAD_MODES.OPEN },
      courses: {
        create: {
          title: "Start Here",
          slug: "start-here",
          description:
            "Your journey begins here. Watch this to pick the right pathway for you!",
          position: 0,
          chapters: { create: { title: "Chapter 1", position: 0 } },
        },
      },
    },
    select: { slug: true },
  });

  revalidatePath("/hub");
  redirect(`/h/${hub.slug}/manage`);
}

const SettingsSchema = z.object({
  name: z.string().trim().min(1, "Give the offer a name").max(80),
  slug: z.string().trim().max(60).optional(),
  description: z.string().trim().max(400).optional(),
  thumbnailUrl: z.string().optional(),
  accent: z.string().optional(),
  status: z.string().optional(),
});

/** The offer's own fields: its name, its art, its URL, and whether it is open. */
export async function saveHubSettings(
  _prev: HubState,
  formData: FormData,
): Promise<HubState> {
  const slug = String(formData.get("slug_current") ?? "");
  const { hub } = await requireHubAdmin(slug);

  const parsed = SettingsSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    thumbnailUrl: String(formData.get("thumbnailUrl") ?? ""),
    accent: String(formData.get("accent") ?? ""),
    status: String(formData.get("status") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  // Only touched when it actually changed, so saving this form cannot quietly break a
  // link already handed to a room full of students.
  const wanted = data.slug ? slugify(data.slug) : hub.slug;
  const next = wanted === hub.slug ? hub.slug : await freeSlug(wanted, hub.id);

  await prisma.hub.update({
    where: { id: hub.id },
    data: {
      name: data.name,
      slug: next,
      description: data.description || null,
      thumbnailUrl: data.thumbnailUrl || null,
      accent: isTint(data.accent) ? data.accent : "violet",
      status: isHubStatus(data.status) ? data.status : hub.status,
    },
  });

  revalidatePath("/hub");
  // A changed slug moves the page out from under them, so the redirect is the
  // confirmation. Otherwise say so, because the header above this form is the only
  // other sign it worked.
  if (next !== hub.slug) redirect(`/h/${next}/settings`);
  revalidatePath(`/h/${next}/settings`);
  return { ok: "Saved." };
}

/** Open or close an offer from the directory, without going into it. */
export async function setHubStatus(formData: FormData) {
  await requireGlobal();

  const hubId = String(formData.get("hubId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isHubStatus(status)) return;

  await prisma.hub.update({ where: { id: hubId }, data: { status } });
  revalidatePath("/hub");
}

/** The order of the tiles in the directory. */
export async function reorderHubs(ids: string[]) {
  await requireGlobal();

  const known = await prisma.hub.findMany({ select: { id: true } });
  const valid = new Set(known.map((hub) => hub.id));
  const order = ids.filter((id) => valid.has(id));

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.hub.update({ where: { id }, data: { position: index } }),
    ),
  );
  revalidatePath("/hub");
  return { ok: true };
}

/**
 * Deletes an offer and everything in it: its courses, its lessons, its students and
 * their progress, its codes and its download log.
 *
 * Owner-only, and the confirmation is the typed name. The one action here that cannot
 * be undone by putting back what was removed.
 */
export async function deleteHub(formData: FormData) {
  const actor = await requireOwner();
  void actor;

  const hubId = String(formData.get("hubId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();

  const hub = await prisma.hub.findUnique({
    where: { id: hubId },
    select: { name: true },
  });
  if (!hub) notFound();
  if (confirm !== hub.name) return;

  await prisma.hub.delete({ where: { id: hubId } });
  revalidatePath("/hub");
  redirect("/hub");
}

/**
 * Moves an admin between running one offer and running all of them.
 *
 * The difference is a single field — an admin carrying a hubId is bounded by it exactly
 * as a student is, and clearing it hands them the directory. Owner-only, because it is
 * the difference between managing an offer and managing the business.
 */
export async function setAdminScope(formData: FormData) {
  await requireOwner();

  const userId = String(formData.get("userId") ?? "");
  const hubId = String(formData.get("hubId") ?? "") || null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || isOwner(user) || user.role !== "ADMIN") return;
  if (hubId) {
    const hub = await prisma.hub.findUnique({ where: { id: hubId } });
    if (!hub) return;
  }

  await prisma.user.update({ where: { id: userId }, data: { hubId } });
  revalidatePath("/hub");
}
