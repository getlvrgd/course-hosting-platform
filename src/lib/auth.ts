import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { prisma } from "./db";
import { ROLES, hasAdminAccess } from "./options";

const COOKIE = "course_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Session = {
  userId: string;
  /** The one hub this person belongs to. Null for an owner or a cross-offer admin. */
  hubId: string | null;
  name: string;
  /** OWNER | ADMIN | STUDENT. */
  role: string;
  /** When this token was issued, in seconds. Checked against `passwordChangedAt`. */
  issuedAt: number;
};

/**
 * The signed-in person, re-read from the database rather than taken from the token.
 *
 * `joinedAt` rides along because drip feeding is counted from it, and every lesson the
 * player renders has to answer "is this open for them yet".
 */
export type Actor = Session & {
  email: string;
  joinedAt: Date;
};

/**
 * The owner holds every admin power as well as their own, so this is what the app keeps
 * checking. Only deleting an owner asks `isOwner` instead.
 */
export const isAdmin = (session: { role: string }) => hasAdminAccess(session.role);

export const isOwner = (session: { role: string }) => session.role === ROLES.OWNER;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    // Failing loudly beats silently signing sessions with a guessable key.
    // The length is named because a set-but-too-short value is the failure that
    // looks identical to a correct one in a dashboard that masks it.
    throw new Error(
      value
        ? `AUTH_SECRET is ${value.length} characters; it must be at least 32.`
        : "AUTH_SECRET is not set.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

/**
 * Verifies a login. Returns null for both "no such user" and "wrong password" so the
 * response cannot be used to discover which email addresses exist.
 */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), isActive: true },
  });
  if (!user) {
    // Spend the same time hashing as a real check would, so timing does not leak
    // whether the account exists.
    await bcrypt.compare(
      password,
      "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv",
    );
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function createSession(user: {
  id: string;
  hubId: string | null;
  name: string;
  role: string;
}) {
  const token = await new SignJWT({
    hubId: user.hubId ?? null,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      hubId: payload.hubId ? String(payload.hubId) : null,
      name: String(payload.name),
      role: String(payload.role),
      issuedAt: typeof payload.iat === "number" ? payload.iat : 0,
    };
  } catch {
    // Expired or tampered token — treat as signed out.
    return null;
  }
}

/**
 * The session, checked against the row behind it.
 *
 * This is where a revoked account is caught: deactivating someone, or demoting an
 * admin to a student, has to take effect on their next click rather than thirty days
 * later when the cookie expires.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      hubId: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      passwordChangedAt: true,
    },
  });
  if (!user || !user.isActive) return null;

  // A token minted before the password changed belongs to a session that should have
  // ended when it did. Compared in whole seconds because that is the resolution `iat`
  // has — a token issued in the same second as the change is the new one, and stays.
  if (
    user.passwordChangedAt &&
    session.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    return null;
  }

  return {
    userId: user.id,
    // Straight from the row, so moving somebody between offers lands on their next
    // click rather than at their next sign-in.
    hubId: user.hubId,
    name: user.name,
    email: user.email,
    issuedAt: session.issuedAt,
    // Straight from the row, so a role change lands immediately rather than at the
    // next sign-in.
    role: user.role,
    joinedAt: user.createdAt,
  };
}
