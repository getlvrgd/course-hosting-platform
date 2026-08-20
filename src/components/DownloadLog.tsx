import { isRefusal, OUTCOME_LABEL, outcomeTone } from "@/lib/downloads";

import { Ago, Empty } from "./ui";

export type AttemptRow = {
  id: string;
  userName: string;
  userEmail: string;
  lessonTitle: string;
  courseTitle: string;
  outcome: string;
  at: Date;
  code: { label: string } | null;
};

/**
 * Who pressed Download, and what happened.
 *
 * The refusals are the reason this exists. One person mistyping a code is nothing; the
 * same account trying six in a minute is somebody working at it, and that pattern only
 * appears if the failures are written down alongside the successes. So they are marked
 * rather than hidden, and the count of them sits at the top where it is hard to miss.
 *
 * Three tones, not two. "Pressed Download" is neither a success nor a failure — it is
 * somebody showing an interest, which is worth seeing but is not an alarm. Colouring
 * those red would cry wolf and bury the rows that are real refusals.
 */
export function DownloadLog({
  attempts,
  now,
}: {
  attempts: AttemptRow[];
  now: number;
}) {
  const refused = attempts.filter((row) => isRefusal(row.outcome)).length;
  const opened = attempts.filter((row) => row.outcome === "OPENED").length;

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px]">Who has asked</h2>
        <p className="text-[13px] text-ink-secondary">
          Last {attempts.length}
          {opened > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-ink">{opened} asked</span>
            </>
          )}
          {refused > 0 && (
            <>
              {" · "}
              <span className="font-bold text-critical">{refused} refused</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-3">
        {attempts.length === 0 ? (
          <Empty title="Nobody has pressed Download">
            Every press lands here — the ones that worked and the ones that did not.
          </Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="text-left text-[11px] font-bold tracking-widest text-ink-muted uppercase">
                  <th className="py-2 pr-3 font-bold">Who</th>
                  <th className="px-3 py-2 font-bold">What</th>
                  <th className="px-3 py-2 font-bold">Outcome</th>
                  <th className="px-3 py-2 font-bold">Code</th>
                  <th className="px-3 py-2 font-bold">When</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((row) => {
                  const tone = outcomeTone(row.outcome);
                  return (
                    <tr key={row.id} className="border-t border-subtle">
                      <td className="py-2 pr-3">
                        <span className="block text-[13px] font-semibold text-ink">
                          {row.userName}
                        </span>
                        <span className="block text-[11px] text-ink-muted">
                          {row.userEmail}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-56 truncate text-[13px] text-ink-secondary">
                          {row.lessonTitle}
                        </span>
                        <span className="block max-w-56 truncate text-[11px] text-ink-muted">
                          {row.courseTitle}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
                            tone === "bad" ? "text-critical" : "text-ink-secondary"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full"
                            style={{
                              background: {
                                good: "var(--status-good)",
                                note: "var(--series-4)",
                                bad: "var(--status-critical)",
                              }[tone],
                            }}
                          />
                          {OUTCOME_LABEL[row.outcome] ?? row.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-ink-muted">
                        {row.code?.label ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-ink-secondary">
                        <Ago date={row.at} now={now} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
