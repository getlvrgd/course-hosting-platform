"use server";

import { z } from "zod";

import { requireActor } from "@/lib/access";
import { createSession, hashPassword, verifyCredentials } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Your own account.
 *
 * This is the only way an owner's password ever changes. The roster deliberately
 * refuses to touch the owner — no admin may reset it, and nobody may reset their own
 * from there — which left the owner with no route at all until this.
 *
 * Available to everyone signed in, not only the owner: an account being able to change
 * its own password is not a privilege, and the alternative is a student having to ask
 * somebody to reset it for them every time.
 */

export type AccountState = { error?: string; ok?: string };

const ChangeSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "The new password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((data) => data.next === data.confirm, {
    message: "The two new passwords don't match",
  })
  .refine((data) => data.next !== data.current, {
    message: "That is already your password",
  });

export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const actor = await requireActor();

  const parsed = ChangeSchema.safeParse({
    current: String(formData.get("current") ?? ""),
    next: String(formData.get("next") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  // The current password is asked for so that a borrowed or unattended session cannot
  // be used to take the account. Verified the same way a sign-in is, against the hash.
  const confirmed = await verifyCredentials(actor.email, parsed.data.current);
  if (!confirmed || confirmed.id !== actor.userId) {
    return { error: "That isn't your current password." };
  }

  const changedAt = new Date();
  const user = await prisma.user.update({
    where: { id: actor.userId },
    data: {
      passwordHash: await hashPassword(parsed.data.next),
      // Every token issued before this instant stops working — see getActor. Which is
      // the point: somebody changing their password in a hurry is usually trying to
      // get rid of whoever else is signed in.
      passwordChangedAt: changedAt,
    },
    select: { id: true, hubId: true, name: true, role: true },
  });

  // Issued after the cut-off, so the person who just changed it stays signed in while
  // every other session ends.
  await createSession(user);

  return {
    ok: "Password changed. Anywhere else you were signed in has been signed out.",
  };
}
