"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  removePerson,
  resetPassword,
  setPersonActive,
  setPersonRole,
  type PersonState,
} from "@/app/actions/students";
import type { StudentRow as Row } from "@/lib/catalog-types";
import { newPassword } from "@/lib/newPassword";
import { ROLES, roleLabel } from "@/lib/options";

import { Menu, MenuItem } from "./Menu";
import { PresenceDot } from "./PresenceDot";
import { Ago, Avatar, ProgressLine } from "./ui";

/**
 * One person on the roster: who they are, how far through the library they have got,
 * and the `⋯` that manages them.
 *
 * The owner's row carries no menu at all — not a disabled one. There is nothing an
 * admin may do to it, and an empty menu that opens onto nothing is worse than no menu.
 */
export function StudentRow({
  person,
  isSelf,
  canManage,
  canPromote,
  now,
  slug,
}: {
  person: Row;
  isSelf: boolean;
  canManage: boolean;
  canPromote: boolean;
  /** One clock read for the whole table — see Ago. */
  now: number;
  /** The offer this roster belongs to; every action is checked against it. */
  slug: string;
}) {
  const [reset, setReset] = useState<string | null>(null);
  const [state, resetAction] = useActionState<PersonState, FormData>(
    resetPassword,
    {},
  );

  const post = (action: (form: FormData) => Promise<void>, extra: [string, string][]) => {
    const form = new FormData();
    form.set("userId", person.id);
    form.set("slug", slug);
    for (const [key, value] of extra) form.set(key, value);
    void action(form);
  };

  return (
    <tr className={`border-t border-subtle ${person.isActive ? "" : "opacity-55"}`}>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5">
          <Avatar
            name={person.name}
            color={person.role === ROLES.STUDENT ? "blue" : "violet"}
            size={28}
          />
          <div className="min-w-0">
            <Link
              href={`/h/${slug}/students/${person.id}`}
              className="block truncate text-[13px] font-bold text-ink hover:text-accent"
            >
              {person.name}
              {isSelf && <span className="ml-1 text-[11px] text-ink-muted">(you)</span>}
            </Link>
            <span className="block truncate text-[12px] text-ink-muted">
              {person.email}
            </span>
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5 text-[12px] text-ink-secondary">
        {roleLabel(person.role)}
        {!person.isActive && (
          <span className="block text-[11px] text-ink-muted">Deactivated</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <ProgressLine value={person.percent} accent="blue" />
        <span className="tabular block text-[11px] text-ink-muted">
          {person.completed} of {person.lessons} lessons
          {person.coursesDone > 0 && ` · ${person.coursesDone} finished`}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <PresenceDot
          lastSeenAt={person.lastSeenAt ? person.lastSeenAt.toISOString() : null}
          lastActiveAt={person.lastActiveAt ? person.lastActiveAt.toISOString() : null}
          disabled={!person.isActive}
        />
        {/* The relative time stays under the dot: "offline" on its own does not say
            whether they left ten minutes ago or never arrived. */}
        <span className="mt-0.5 block text-[11px] text-ink-muted">
          <Ago date={person.lastSeenAt} now={now} />
        </span>
      </td>

      <td className="py-2.5 pl-3 text-right">
        {canManage ? (
          <div className="flex items-center justify-end gap-2">
            {reset && (
              <form action={resetAction} className="flex items-center gap-1.5">
                <input type="hidden" name="userId" value={person.id} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="password" value={reset} />
                <span className="font-mono text-[12px] font-bold text-ink">{reset}</span>
                <button
                  type="submit"
                  className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-secondary hover:border-strong hover:text-ink"
                >
                  Set it
                </button>
                <button
                  type="button"
                  onClick={() => setReset(null)}
                  aria-label="Cancel the reset"
                  className="px-1 text-[12px] text-ink-muted hover:text-ink"
                >
                  ✕
                </button>
              </form>
            )}

            {state.ok && !reset && (
              <span className="text-[12px] text-ink-muted">{state.ok}</span>
            )}

            <Menu label={`Manage ${person.name}`}>
              {(close) => (
                <>
                  <MenuItem
                    icon="👁"
                    onClick={() => {
                      close();
                      window.location.href = `/h/${slug}/students/${person.id}`;
                    }}
                  >
                    See their progress
                  </MenuItem>
                  <MenuItem
                    icon="🔑"
                    onClick={() => {
                      setReset(newPassword());
                      close();
                    }}
                  >
                    Reset password
                  </MenuItem>
                  {canPromote && (
                    <MenuItem
                      icon="⇅"
                      onClick={() => {
                        post(setPersonRole, [
                          [
                            "role",
                            person.role === ROLES.ADMIN ? ROLES.STUDENT : ROLES.ADMIN,
                          ],
                        ]);
                        close();
                      }}
                    >
                      {person.role === ROLES.ADMIN
                        ? "Make them a student"
                        : "Make them an admin"}
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={person.isActive ? "⏸" : "▶"}
                    onClick={() => {
                      post(setPersonActive, [["active", person.isActive ? "0" : "1"]]);
                      close();
                    }}
                  >
                    {person.isActive ? "Deactivate" : "Reactivate"}
                  </MenuItem>
                  <MenuItem
                    icon="🗑"
                    tone="danger"
                    onClick={() => {
                      close();
                      if (
                        confirm(
                          `Delete ${person.name}? Their progress goes with them. Deactivating keeps the record.`,
                        )
                      ) {
                        post(removePerson, []);
                      }
                    }}
                  >
                    Delete account
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        ) : (
          <span className="text-[12px] text-ink-muted">—</span>
        )}
      </td>
    </tr>
  );
}
