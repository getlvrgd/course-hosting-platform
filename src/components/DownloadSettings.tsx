"use client";

import { useActionState } from "react";

import { setDownloadMode, type SettingsState } from "@/app/actions/settings";
import type { DownloadMode } from "@/lib/settings";

/**
 * The three answers to "what may a student do with an uploaded video".
 *
 * Written out as three cards rather than a switch, because they are not degrees of the
 * same thing — they have different costs and different failure modes, and the middle
 * one is the interesting one. Someone choosing here is trying to stop their course
 * leaking, and deserves to be told what each option actually prevents.
 */
const OPTIONS: {
  value: DownloadMode;
  title: string;
  blurb: string;
  cost: string;
}[] = [
  {
    value: "open",
    title: "Anyone can download",
    blurb:
      "Videos play straight from storage with the browser's own save button. The storage link is in the page, and it works for anyone who copies it.",
    cost: "Cheapest — playback comes off a CDN and never touches this app.",
  },
  {
    value: "code",
    title: "Downloading needs a code",
    blurb:
      "Videos play through this app, so the storage link is never in the page. The save button is replaced by one that asks for a code you issue — and every press is logged, whether or not they got in.",
    cost: "Playback uses your hosting bandwidth. You see who is asking.",
  },
  {
    value: "off",
    title: "No downloading at all",
    blurb:
      "As above, with no download button. Nothing legitimate gets a copy — including people you would have said yes to.",
    cost: "Playback uses your hosting bandwidth.",
  },
];

export function DownloadSettings({
  mode,
  slug,
}: {
  mode: DownloadMode;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    setDownloadMode,
    {},
  );

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
      <h2 className="text-[16px]">Uploaded videos</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-ink-secondary">
        Embedded videos are not affected — a YouTube or Loom lesson plays in that host&apos;s
        own player, and what they allow is their decision. Attachments are not affected
        either: a workbook is meant to be downloaded.
      </p>

      <div className="mt-4 grid gap-2">
        {OPTIONS.map((option) => {
          const on = mode === option.value;
          return (
            <form key={option.value} action={formAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="downloads" value={option.value} />
              <button
                type="submit"
                disabled={pending || on}
                aria-pressed={on}
                className={`w-full rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${
                  on
                    ? "border-accent bg-accent-soft"
                    : "border-subtle hover:border-strong"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`grid size-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${
                      on ? "border-transparent text-page" : "border-strong text-transparent"
                    }`}
                    style={on ? { background: "var(--accent)" } : undefined}
                  >
                    ✓
                  </span>
                  <span className="text-[14px] font-bold text-ink">{option.title}</span>
                </span>
                <span className="mt-1 block pl-6 text-[12px] text-ink-secondary">
                  {option.blurb}
                </span>
                <span className="mt-1 block pl-6 text-[12px] text-ink-muted">
                  {option.cost}
                </span>
              </button>
            </form>
          );
        })}
      </div>

      {state.ok && (
        <p className="mt-3 text-[12px] text-ink-secondary">{state.ok}</p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 text-[12px] text-critical">
          {state.error}
        </p>
      )}

      <div className="mt-4 border-t border-subtle pt-3 text-[12px] text-ink-muted">
        <p className="font-bold text-ink">What none of these can do</p>
        <p className="mt-1">
          A browser that can play a video can save it. Someone signed in who opens the
          developer tools can take the file the player is streaming, whichever option is
          selected above — and anyone at all can point a phone at the screen. There is
          no setting that changes either of those; the real answer is DRM or segmented
          streaming, which is a different product.
        </p>
        <p className="mt-1.5">
          So read the middle option as <span className="font-bold text-ink">friction
          and a paper trail</span>, not a lock. It stops a copy being one click, it
          stops a link working for anyone outside the hub, and it puts a name against
          every attempt. That is worth having — it is just not the same as the file
          being safe.
        </p>
      </div>
    </div>
  );
}
