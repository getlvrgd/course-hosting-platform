"use client";

import { useActionState, useState } from "react";

import { completeSetup, type SetupState } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { INPUT, LABEL } from "@/components/ui";
import { newPassword } from "@/lib/newPassword";

/**
 * The owner's own account, created once and never again.
 *
 * The suggested password is generated here in the browser rather than on the server:
 * it is a credential, and it should not travel anywhere it does not have to.
 */
export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    completeSetup,
    {},
  );
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Logo height={26} />

        <h1 className="mt-4 text-[24px]">Set up your hub</h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          This makes the owner account. It only happens once — after this, everyone else
          is added from the Students tab.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className={LABEL}>
              Your name
            </label>
            <input id="name" name="name" required className={`${INPUT} mt-1`} />
          </div>

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
              type="text"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${INPUT} mt-1`}
            />
            <button
              type="button"
              onClick={() => setPassword(newPassword())}
              className="mt-1 text-[12px] font-semibold text-accent hover:opacity-80"
            >
              Suggest one
            </button>
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
            {pending ? "Creating…" : "Create my account"}
          </button>
        </form>
      </div>
    </div>
  );
}
