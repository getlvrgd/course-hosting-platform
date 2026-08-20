"use client";

import { useActionState, useState } from "react";

import { createCode, revokeCode, type CodeState } from "@/app/actions/downloads";

import { Ago, BTN, BTN_PRIMARY, HINT, INPUT, LABEL } from "./ui";

export type CodeRow = {
  id: string;
  label: string;
  hint: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/**
 * The codes in circulation.
 *
 * A code is shown **once**, at the moment it is made, and only its hash is kept — so
 * there is no screen anywhere that lists what everyone's code actually is. Losing one
 * means issuing another, which is the right trade for a credential that is going to be
 * pasted into WhatsApp.
 *
 * Withdrawing rather than deleting, so the attempts that used a code still read in the
 * log after it is out of use.
 */
export function DownloadCodes({
  codes,
  now,
  slug,
}: {
  codes: CodeRow[];
  now: number;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState<CodeState, FormData>(
    createCode,
    {},
  );
  const [open, setOpen] = useState(false);

  const live = codes.filter(
    (code) =>
      !code.revokedAt &&
      (code.maxUses === null || code.usedCount < code.maxUses) &&
      (!code.expiresAt || code.expiresAt.getTime() > now),
  ).length;

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px]">Download codes</h2>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {live} in circulation. Give one to somebody who should have a copy.
          </p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}>
            + New code
          </button>
        )}
      </div>

      {open && (
        <form action={formAction} className="mt-4 rounded-xl border border-subtle p-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="label" className={LABEL}>
                Who it&apos;s for
              </label>
              <input
                id="label"
                name="label"
                required
                autoFocus
                placeholder="Sam Rivera"
                className={`${INPUT} mt-1`}
              />
              <p className={HINT}>Only you see this.</p>
            </div>

            <div>
              <label htmlFor="maxUses" className={LABEL}>
                Downloads allowed
              </label>
              <input
                id="maxUses"
                name="maxUses"
                type="number"
                min={0}
                max={1000}
                defaultValue={1}
                className={`${INPUT} mt-1`}
              />
              <p className={HINT}>1 makes it single-use. 0 is unlimited.</p>
            </div>

            <div>
              <label htmlFor="days" className={LABEL}>
                Expires after
              </label>
              <input
                id="days"
                name="days"
                type="number"
                min={0}
                max={365}
                defaultValue={7}
                className={`${INPUT} mt-1`}
              />
              <p className={HINT}>Days. 0 never expires.</p>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="mt-2 text-[13px] text-critical">
              {state.error}
            </p>
          )}

          {state.created && (
            <div className="mt-3 rounded-lg border border-accent-edge bg-accent-soft p-3">
              <p className="text-[12px] font-semibold text-ink-secondary">
                Send them this. It will not be shown again.
              </p>
              <p className="mt-1 font-mono text-[18px] font-bold tracking-wider text-ink">
                {state.created}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button type="submit" disabled={pending} className={BTN_PRIMARY}>
              {pending ? "Making…" : "Make a code"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={BTN}>
              Done
            </button>
          </div>
        </form>
      )}

      {codes.length > 0 && (
        <div className="scroll-x mt-4">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-widest text-ink-muted uppercase">
                <th className="py-2 pr-3 font-bold">For</th>
                <th className="px-3 py-2 font-bold">Code</th>
                <th className="px-3 py-2 font-bold">Used</th>
                <th className="px-3 py-2 font-bold">Expires</th>
                <th className="py-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const spent =
                  code.maxUses !== null && code.usedCount >= code.maxUses;
                const expired =
                  code.expiresAt !== null && code.expiresAt.getTime() <= now;
                const dead = Boolean(code.revokedAt) || spent || expired;
                return (
                  <tr
                    key={code.id}
                    className={`border-t border-subtle ${dead ? "opacity-55" : ""}`}
                  >
                    <td className="py-2 pr-3 text-[13px] font-semibold text-ink">
                      {code.label}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-ink-muted">
                      {code.hint}••••••
                    </td>
                    <td className="tabular px-3 py-2 text-[12px] text-ink-secondary">
                      {code.usedCount}
                      {code.maxUses === null ? "" : ` of ${code.maxUses}`}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-ink-secondary">
                      {code.expiresAt ? <Ago date={code.expiresAt} now={now} /> : "Never"}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {code.revokedAt ? (
                        <span className="text-[12px] text-ink-muted">Withdrawn</span>
                      ) : spent ? (
                        <span className="text-[12px] text-ink-muted">Used up</span>
                      ) : expired ? (
                        <span className="text-[12px] text-ink-muted">Expired</span>
                      ) : (
                        <form action={revokeCode}>
                          <input type="hidden" name="codeId" value={code.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <button
                            type="submit"
                            className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-muted transition-colors hover:border-critical hover:text-critical"
                          >
                            Withdraw
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
