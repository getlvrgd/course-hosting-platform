"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homePathFor, needsSetup } from "@/lib/access";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyCredentials,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/options";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    // Deliberately vague: never reveal whether the email exists, or whether the
    // account is simply deactivated.
    return { error: "Those details don't match an account." };
  }

  await createSession(user);
  redirect(await homePathFor(user));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* -------------------------------------------------------------------- first run -- */

export type SetupState = { error?: string };

const SetupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(80),
  email: z.email("That email doesn't look right"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Mints the one owner account, and only while there are no accounts at all.
 *
 * The check is repeated inside the transaction rather than trusted from the page: two
 * people hitting /setup at the same moment must not both become owner.
 */
export async function completeSetup(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (!(await needsSetup())) return { error: "This hub has already been set up." };

  const parsed = SetupSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const owner = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) return null;
    return tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: ROLES.OWNER,
      },
    });
  });
  if (!owner) return { error: "This hub has already been set up." };

  await createSession(owner);
  redirect(await homePathFor(owner));
}
