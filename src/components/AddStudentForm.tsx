"use client";

import { useActionState, useState } from "react";

import { addPerson, type PersonState } from "@/app/actions/students";
import { newPassword } from "@/lib/newPassword";

import { BTN, BTN_PRIMARY, INPUT, LABEL } from "./ui";

/**
 * Adding a student: a name, an email, a password you can read.
 *
 * Only ever a student. Somebody who runs the offer is added in Settings → Team, so
 * there is no dropdown here that could quietly appoint an admin by mis-click.
 *
 * The password is generated in the browser and shown in plain text, because the person
 * filling this in has to send it to somebody. It is hashed the moment it arrives and
 * is never legible again — which is why it is shown once here, and why the only way
 * back from a lost one is a reset.
 */
export function AddStudentForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PersonState, FormData>(
    addPerson,
    {},
  );
  const [password, setPassword] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setPassword(newPassword());
          setOpen(true);
        }}
        className={BTN_PRIMARY}
      >
        + Add someone
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full rounded-2xl border border-subtle bg-surface p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="name" className={LABEL}>
            Name
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
            Suggest another
          </button>
        </div>

      </div>

      {state.error && (
        <p role="alert" className="mt-3 text-[13px] text-critical">
          {state.error}
        </p>
      )}

      {state.ok && (
        <p className="mt-3 text-[13px] text-ink-secondary">
          {state.ok} Their password is{" "}
          <span className="font-mono font-bold text-ink">{state.password}</span> — send
          it to them now, it will not be shown again.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Adding…" : "Add them"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BTN}>
          Done
        </button>
      </div>
    </form>
  );
}
