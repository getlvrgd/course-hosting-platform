import "server-only";

import { createHash } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { prisma } from "./db";

/**
 * Codes, attempts, and the short-lived ticket that actually fetches a file.
 *
 * The design in one line: **the code is the permission, the log is the point.** A
 * download that needed a code is a download somebody had to ask for, and every press
 * of the button — granted or refused — is written down, so "who is trying to take my
 * course" stops being a guess.
 */

/* ----------------------------------------------------------------------- codes -- */

/**
 * Unambiguous over WhatsApp and over the phone: no O/0, no I/1/l. Ten characters from
 * these thirty-two is fifty bits, which is far past anything guessable online — and
 * the rate limit below closes that door regardless.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newDownloadCode() {
  const bytes = new Uint32Array(10);
  // Crypto rather than Math.random: this is a credential, not a shuffle.
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join("");
  // Grouped so it can be read aloud without losing your place.
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Typed-in codes arrive with stray spaces, lowercase and missing dashes. */
export const normaliseCode = (input: string) =>
  input.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const hashCode = (input: string) =>
  createHash("sha256").update(normaliseCode(input)).digest("hex");

/** The first four characters, so the owner can tell two rows apart at a glance. */
export const hintOf = (code: string) => normaliseCode(code).slice(0, 4);

/* --------------------------------------------------------------------- outcomes -- */

export const OUTCOMES = {
  /**
   * They pressed Download. Written the moment the menu item is clicked, before any
   * code is typed and whether or not one ever is.
   *
   * This is the row that answers "who is trying to take my course". Somebody who opens
   * the box, sees it wants a code and thinks better of it leaves no other trace — and
   * that is exactly the person worth knowing about.
   */
  OPENED: "OPENED",
  /** They had a good code and got the file. */
  GRANTED: "GRANTED",
  /** The owner or an admin, who does not need one. Logged anyway. */
  ADMIN: "ADMIN",
  NO_CODE: "NO_CODE",
  WRONG_CODE: "WRONG_CODE",
  EXPIRED: "EXPIRED",
  EXHAUSTED: "EXHAUSTED",
  REVOKED: "REVOKED",
  /** Too many failures too quickly — the code was not even checked. */
  BLOCKED: "BLOCKED",
} as const;

export type Outcome = (typeof OUTCOMES)[keyof typeof OUTCOMES];

export const OUTCOME_LABEL: Record<string, string> = {
  OPENED: "Pressed Download",
  GRANTED: "Downloaded",
  ADMIN: "Downloaded (admin)",
  NO_CODE: "No code entered",
  WRONG_CODE: "Wrong code",
  EXPIRED: "Code had expired",
  EXHAUSTED: "Code already used up",
  REVOKED: "Code had been withdrawn",
  BLOCKED: "Blocked — too many tries",
};

/**
 * How loudly a row should read in the log.
 *
 * Three tones rather than two, because pressing the button is neither a success nor a
 * failure: it is somebody showing an interest. Colouring those red would cry wolf and
 * bury the rows that are actually refusals.
 */
export type Tone = "good" | "note" | "bad";

export function outcomeTone(outcome: string): Tone {
  if (outcome === OUTCOMES.GRANTED || outcome === OUTCOMES.ADMIN) return "good";
  if (outcome === OUTCOMES.OPENED) return "note";
  return "bad";
}

/** A refused attempt at a code — not merely an interest shown. */
export const isRefusal = (outcome: string) => outcomeTone(outcome) === "bad";

/* ----------------------------------------------------------------- rate limiting -- */

/**
 * Five failures in ten minutes and this account stops being asked for a code at all.
 *
 * Fifty bits of code is not guessable by hand, so this is not really about entropy —
 * it is about the log staying readable. Someone hammering the box would otherwise bury
 * the rows that matter under a hundred of their own.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function isRateLimited(userId: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.downloadAttempt.count({
    where: {
      // Across every hub, deliberately: somebody working through codes in one offer
      // should not get a fresh five tries by switching to another.
      userId,
      at: { gte: since },
      // Only real attempts at a code count. A BLOCKED row is a refusal this app
      // already issued, and counting those would mean every impatient click extended
      // the lockout — which would make "try again in ten minutes" untrue. They are
      // still written to the log, because somebody hammering the box is exactly what
      // the owner wants to see.
      outcome: {
        // Opening the box is not an attempt at a code, so clicking Download five times
        // without typing anything must not lock somebody out.
        notIn: [
          OUTCOMES.GRANTED,
          OUTCOMES.ADMIN,
          OUTCOMES.BLOCKED,
          OUTCOMES.OPENED,
        ],
      },
    },
  });
  return failures >= MAX_FAILURES;
}

/* -------------------------------------------------------------------- the ticket -- */

/**
 * A few minutes' permission to fetch one file, for one person.
 *
 * The code check happens in a server action; the file is fetched by the browser
 * navigating to a URL. Something has to carry the "yes" between the two, and it must
 * not be a URL that keeps working or that works for anybody else — hence a signed
 * ticket, bound to both the person and the lesson, that expires almost immediately.
 *
 * Signed with AUTH_SECRET but under its own audience, so a ticket can never be
 * mistaken for a session cookie or the other way round.
 */
const AUDIENCE = "download-ticket";
const TICKET_SECONDS = 300;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(value);
}

export async function mintTicket(userId: string, lessonId: string) {
  return new SignJWT({ lessonId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TICKET_SECONDS}s`)
    .sign(secret());
}

/** True only for a ticket this person was given, for this lesson, still in date. */
export async function ticketAllows(
  token: string,
  userId: string,
  lessonId: string,
) {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUDIENCE });
    return payload.sub === userId && payload.lessonId === lessonId;
  } catch {
    // Expired, tampered with, or signed for something else entirely.
    return false;
  }
}

/* ------------------------------------------------------------------------- log -- */

/**
 * Writes down what happened. Called on every path, including the refusals — those are
 * the rows worth having.
 *
 * Names are copied in rather than referenced so the log still reads after an account
 * is deleted or a lesson is taken down.
 */
export async function logAttempt(entry: {
  hubId: string;
  actor: { userId: string; name: string; email: string };
  lesson: { id: string; title: string; course: string } | null;
  outcome: Outcome;
  codeId?: string | null;
}) {
  await prisma.downloadAttempt
    .create({
      data: {
        hubId: entry.hubId,
        userId: entry.actor.userId,
        userName: entry.actor.name,
        userEmail: entry.actor.email,
        lessonId: entry.lesson?.id ?? null,
        lessonTitle: entry.lesson?.title ?? "(gone)",
        courseTitle: entry.lesson?.course ?? "(gone)",
        outcome: entry.outcome,
        codeId: entry.codeId ?? null,
      },
    })
    .catch(() => {
      // A log that cannot be written must not become a download that cannot happen —
      // nor one that silently succeeds where it should have failed. The caller has
      // already decided; this is the record of it.
    });
}
