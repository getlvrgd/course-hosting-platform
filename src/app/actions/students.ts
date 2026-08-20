"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHubAdmin } from "@/lib/access";
import { hashPassword, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLES, hasAdminAccess } from "@/lib/options";

/**
 * The roster.
 *
 * A password is only ever written, never read: it is hashed on the way in, so a reset
 * is the only way to recover one. The generated password comes back once, in the form
 * that created it, and then it is gone.
 *
 * Two rules run through every action here:
 *
 *   * The owner's account cannot be touched from any of these — not renamed, not
 *     deactivated, not deleted, not given a new password. It is changed by signing in
 *     as them.
 *   * An admin runs the students. Other admins are the owner's to manage, so an admin
 *     replaying a post against one lands on `isOwner` and is refused.
 */

export type PersonState = { error?: string; ok?: string; password?: string };

const PersonSchema = z.object({
  name: z.string().trim().min(1, "Their name is required").max(80),
  email: z.email("That email doesn't look right"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function addPerson(
  _prev: PersonState,
  formData: FormData,
): Promise<PersonState> {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);

  void actor;
  const parsed = PersonSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    return { error: "There is already an account with that email." };
  }

  await prisma.user.create({
    data: {
      // A student belongs to the hub they were added from and reaches no other. An
      // admin added here is bound to it too — a cross-offer admin is made by clearing
      // the hub from the directory, not from inside one.
      hubId: hub.id,
      name: data.name,
      email: data.email,
      // Always a student. Team members are made in Settings → Team, so there is no
      // form here whose dropdown could quietly mint an admin.
      role: ROLES.STUDENT,
      passwordHash: await hashPassword(data.password),
    },
  });

  revalidatePath(`/h/${slug}/students`);
  revalidatePath(`/h/${slug}/progress`);
  return {
    ok: `${data.name} can sign in now.`,
    // Returned once so it can be copied and sent. It is not stored anywhere legible.
    password: data.password,
  };
}

/* ------------------------------------------------------------------- the team -- */

/**
 * Adds somebody who runs this offer with you.
 *
 * They get a `hubId`, and that single field is the whole boundary: inside this offer
 * they do everything you do, and the directory of your other offers does not exist for
 * them — `/hub` sends them back here, and every other offer answers 404.
 *
 * Any admin of this offer may add another. Bounded to the same hub that is not an
 * escalation — it is the same authority they already hold, handed to somebody else.
 * What they cannot do is touch an admin who already exists; that stays the owner's, so
 * two admins cannot lock each other out.
 */
export async function addTeamMember(
  _prev: PersonState,
  formData: FormData,
): Promise<PersonState> {
  const slug = String(formData.get("slug") ?? "");
  const { hub } = await requireHubAdmin(slug);

  const parsed = PersonSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    return { error: "There is already an account with that email." };
  }

  await prisma.user.create({
    data: {
      // The hub is what bounds them. An admin with none would see the directory and
      // every offer in it, which is the opposite of what this form is for.
      hubId: hub.id,
      name: data.name,
      email: data.email,
      role: ROLES.ADMIN,
      passwordHash: await hashPassword(data.password),
    },
  });

  revalidatePath(`/h/${slug}/settings`);
  revalidatePath(`/h/${slug}/students`);
  return {
    ok: `${data.name} can run ${hub.name} now.`,
    // Shown once so it can be sent. Only its hash is stored.
    password: data.password,
  };
}

/**
 * Takes somebody off the team.
 *
 * Owner-only, unlike adding. An admin removing their colleague is how two people who
 * disagree lock each other out of an offer at three in the morning.
 */
export async function removeTeamMember(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);
  if (!isOwner(actor)) return;

  const userId = String(formData.get("userId") ?? "");
  if (userId === actor.userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, hubId: hub.id, role: ROLES.ADMIN },
    select: { id: true },
  });
  if (!user) return;

  await prisma.user.delete({ where: { id: user.id } });
  revalidatePath(`/h/${slug}/settings`);
  revalidatePath(`/h/${slug}/students`);
}

/**
 * The account this action may act on, or null if it is out of bounds.
 *
 * Bounded by the hub as well as by role: an admin of one offer managing an account
 * from another is exactly what the scoping exists to prevent, so somebody else's
 * student is simply not found.
 */
async function target(
  userId: string,
  hubId: string,
  actorId: string,
  actorRole: string,
) {
  if (userId === actorId) return null; // Never yourself — that is how you lock yourself out.
  const user = await prisma.user.findFirst({
    where: { id: userId, hubId },
    select: { id: true, role: true, name: true },
  });
  if (!user || user.role === ROLES.OWNER) return null;
  if (hasAdminAccess(user.role) && actorRole !== ROLES.OWNER) return null;
  return user;
}

export async function setPersonActive(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "1";

  const user = await target(userId, hub.id, actor.userId, actor.role);
  if (!user) return;

  await prisma.user.update({ where: { id: user.id }, data: { isActive: active } });
  revalidatePath(`/h/${slug}/students`);
  revalidatePath(`/h/${slug}/students/${user.id}`);
}

export async function setPersonRole(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);
  // Promoting someone to admin is the owner's alone — an admin cannot appoint peers.
  if (!isOwner(actor)) return;

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (role !== ROLES.ADMIN && role !== ROLES.STUDENT) return;

  const user = await target(userId, hub.id, actor.userId, actor.role);
  if (!user) return;

  await prisma.user.update({ where: { id: user.id }, data: { role } });
  revalidatePath(`/h/${slug}/students`);
  revalidatePath(`/h/${slug}/students/${user.id}`);
  revalidatePath("/admin/progress");
}

export async function resetPassword(
  _prev: PersonState,
  formData: FormData,
): Promise<PersonState> {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const user = await target(userId, hub.id, actor.userId, actor.role);
  if (!user) return { error: "That account can't be changed from here." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  return { ok: "New password set.", password };
}

/** Removes an account and, with it, every progress row that person wrote. */
export async function removePerson(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { actor, hub } = await requireHubAdmin(slug);
  const userId = String(formData.get("userId") ?? "");

  const user = await target(userId, hub.id, actor.userId, actor.role);
  if (!user) return;

  await prisma.user.delete({ where: { id: user.id } });
  revalidatePath(`/h/${slug}/students`);
  revalidatePath(`/h/${slug}/progress`);
}
