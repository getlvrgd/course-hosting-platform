"use client";

import { useActionState, useState } from "react";

import {
  addTeamMember,
  removeTeamMember,
  type PersonState,
} from "@/app/actions/students";
import { newPassword } from "@/lib/newPassword";

import { Ago, Avatar, BTN, BTN_PRIMARY, INPUT, LABEL } from "./ui";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
};

/**
 * Who runs this offer with you.
 *
 * A team member is an admin **bound to this offer**. Inside it they do everything the
 * owner does — build courses, add students, issue download codes, change the settings.
 * Outside it there is nothing: the directory of your other offers sends them back
 * here, and every other offer answers 404 rather than admitting it exists.
 *
 * They are made here rather than on the Students tab on purpose. One form per kind of
 * person beats one form with a dropdown that quietly changes what you are creating —
 * appointing somebody to run an offer should not be a thing you can do by mis-clicking.
 */
export function TeamSection({
  team,
  slug,
  hubName,
  now,
  isOwner,
  selfId,
}: {
  team: TeamRow[];
  slug: string;
  hubName: string;
  now: number;
  /** Removing somebody is the owner's; adding is any admin's. */
  isOwner: boolean;
  selfId: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<PersonState, FormData>(
    addTeamMember,
    {},
  );

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px]">Team</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-secondary">
            Admins of <span className="font-semibold text-ink">{hubName}</span>. They do
            everything you do in here — courses, students, download codes, these
            settings — and nothing at all outside it. They never see your other offers.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setPassword(newPassword());
              setOpen(true);
            }}
            className={BTN_PRIMARY}
          >
            + Add team member
          </button>
        )}
      </div>

      {open && (
        <form action={formAction} className="mt-4 rounded-xl border border-subtle p-3">
          <input type="hidden" name="slug" value={slug} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="team-name" className={LABEL}>
                Name
              </label>
              <input
                id="team-name"
                name="name"
                required
                autoFocus
                className={`${INPUT} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="team-email" className={LABEL}>
                Email
              </label>
              <input
                id="team-email"
                name="email"
                type="email"
                required
                className={`${INPUT} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="team-password" className={LABEL}>
                Password
              </label>
              <input
                id="team-password"
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
            <p role="alert" className="mt-2 text-[13px] text-critical">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="mt-2 text-[13px] text-ink-secondary">
              {state.ok} Their password is{" "}
              <span className="font-mono font-bold text-ink">{state.password}</span> —
              send it now, it will not be shown again.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button type="submit" disabled={pending} className={BTN_PRIMARY}>
              {pending ? "Adding…" : "Add them"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={BTN}>
              Done
            </button>
          </div>
        </form>
      )}

      {team.length > 0 && (
        <ul className="mt-4 space-y-2">
          {team.map((member) => (
            <li
              key={member.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border border-subtle px-3 py-2.5 ${
                member.isActive ? "" : "opacity-55"
              }`}
            >
              <Avatar name={member.name} color="violet" size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-ink">
                  {member.name}
                  {member.id === selfId && (
                    <span className="ml-1 text-[11px] text-ink-muted">(you)</span>
                  )}
                </p>
                <p className="truncate text-[12px] text-ink-muted">{member.email}</p>
              </div>
              <span className="text-[12px] text-ink-secondary">
                <Ago date={member.lastSeenAt} now={now} />
              </span>

              {isOwner && member.id !== selfId && (
                <form
                  action={removeTeamMember}
                  onSubmit={(event) => {
                    if (
                      !confirm(
                        `Remove ${member.name} from ${hubName}? They lose access immediately.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="userId" value={member.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-muted transition-colors hover:border-critical hover:text-critical"
                  >
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {team.length === 0 && !open && (
        <p className="mt-3 text-[13px] text-ink-muted">
          Nobody else runs this offer yet.
        </p>
      )}

      {!isOwner && team.length > 0 && (
        <p className="mt-3 border-t border-subtle pt-3 text-[12px] text-ink-muted">
          Only the owner can remove somebody from the team — otherwise two admins who
          disagree could lock each other out.
        </p>
      )}
    </div>
  );
}
