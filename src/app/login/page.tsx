"use client";

import { useActionState } from "react";

import { login, type LoginState } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { INPUT, LABEL } from "@/components/ui";

/**
 * One sign-in for everyone. There is no separate admin URL: the role on the account
 * decides where you land and what you can do, so a student cannot reach the owner side
 * by finding a different login page.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Logo height={26} />

        <h1 className="mt-4 text-[24px]">Course Hub</h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          Sign in to pick up where you left off.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className={LABEL}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={`${INPUT} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="password" className={LABEL}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={`${INPUT} mt-1`}
            />
          </div>

          {state.error && (
            <p role="alert" className="text-[13px] text-critical">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-ink px-3 py-2.5 text-[13px] font-bold text-page disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
