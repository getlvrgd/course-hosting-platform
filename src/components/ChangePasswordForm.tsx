"use client";

import { useActionState, useRef } from "react";

import { changePassword, type AccountState } from "@/app/actions/account";

import { BTN_PRIMARY, HINT, INPUT, LABEL } from "./ui";

/**
 * Changing your own password.
 *
 * The current one is asked for, which is the difference between this and the reset an
 * admin performs on somebody else: a reset is an authority acting on an account, and
 * this is the account proving it is itself. Without it, a session left open on a shared
 * machine would be enough to take the account outright.
 *
 * Ordinary password fields rather than the readable, generated ones the roster uses.
 * Those exist because somebody has to send a new password to a third person; this one
 * is being typed by the person who will remember it.
 */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    changePassword,
    {},
  );
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      action={async (data) => {
        await formAction(data);
        // Clearing on the way out rather than only on success: a failed attempt leaves
        // a password sitting in a field on screen, which is the one thing this form
        // should not do.
        form.current?.reset();
      }}
      className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5"
    >
      <h2 className="text-[16px]">Change your password</h2>
      <p className="mt-1 text-[13px] text-ink-secondary">
        You will stay signed in here. Anywhere else you are signed in will be signed out.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="current" className={LABEL}>
            Current password
          </label>
          <input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className={`${INPUT} mt-1`}
          />
        </div>

        <div>
          <label htmlFor="next" className={LABEL}>
            New password
          </label>
          <input
            id="next"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={`${INPUT} mt-1`}
          />
          <p className={HINT}>At least 8 characters.</p>
        </div>

        <div>
          <label htmlFor="confirm" className={LABEL}>
            New password again
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={`${INPUT} mt-1`}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-3 text-[13px] text-critical">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="mt-3 text-[13px] text-good">{state.ok}</p>
      )}

      <button type="submit" disabled={pending} className={`${BTN_PRIMARY} mt-4`}>
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
