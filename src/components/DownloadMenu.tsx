"use client";

import { useActionState, useEffect, useState } from "react";

import {
  noteDownloadIntent,
  requestDownload,
  type DownloadState,
} from "@/app/actions/downloads";

import { Menu, MenuItem } from "./Menu";
import { BTN, BTN_PRIMARY, INPUT } from "./ui";

/**
 * The `⋯` in the corner of the video, and the code box behind it.
 *
 * On the video rather than under it because that is where a player's own options live,
 * and because a Download button sitting in the flow of the page reads as an invitation.
 * Tucked into a menu it reads as what it is: something available if you need it.
 *
 * **Pressing it is recorded before anything else happens** — before the box opens,
 * before a code is typed, and whether or not one ever is. Somebody who sees that a code
 * is wanted and quietly backs out leaves no other trace, and that is exactly the person
 * worth knowing about. The note is fired off without being waited on: it is a line in
 * a ledger, not a permission, and it must not make the box feel slow.
 *
 * Refusals all say the same thing. A wrong code, a spent code and a withdrawn one are
 * one message, so a stranger guessing cannot learn which of their guesses was once
 * real. The owner sees the difference in the log; the person at the box does not.
 */
export function DownloadMenu({
  lessonId,
  filename,
}: {
  lessonId: string;
  /** What the file will be called, so they know what they are asking for. */
  filename: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<DownloadState, FormData>(
    requestDownload,
    {},
  );

  // Closing the box is a render-time consequence of the code being accepted, so it is
  // adjusted here rather than in the effect below — which leaves that effect doing
  // only the one thing effects are for: reaching outside React.
  if (state.url && taken !== state.url) {
    setTaken(state.url);
    setAsking(false);
  }

  // The action hands back a ticket URL rather than the file itself, because a server
  // action cannot stream one. Following it is what starts the download — and because
  // the route answers with `Content-Disposition: attachment`, the browser saves the
  // file and leaves this page where it is.
  useEffect(() => {
    if (state.url) window.location.href = state.url;
  }, [state.url]);

  return (
    <>
      <Menu
        label="Video options"
        trigger="⋮"
        triggerClassName="grid size-8 place-items-center rounded-lg bg-black/55 text-[15px] font-bold text-white backdrop-blur transition-colors hover:bg-black/75"
      >
        {(close) => (
          <MenuItem
            icon="⬇"
            onClick={() => {
              // Fired and not awaited: the box opens now, and the note lands when it
              // lands. Whether it lands does not change what happens next.
              void noteDownloadIntent(lessonId);
              close();
              setAsking(true);
            }}
          >
            Download this video
          </MenuItem>
        )}
      </Menu>

      {asking && (
        <div
          role="dialog"
          aria-modal
          aria-label="Download this video"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAsking(false);
          }}
        >
          <form
            action={formAction}
            className="w-full max-w-sm rounded-2xl border border-strong bg-surface p-4 shadow-xl"
          >
            <input type="hidden" name="lessonId" value={lessonId} />

            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px]">Download this video</h2>
              <button
                type="button"
                onClick={() => setAsking(false)}
                aria-label="Close"
                className="grid size-7 place-items-center rounded-lg border border-subtle text-ink-secondary hover:border-strong hover:text-ink"
              >
                ✕
              </button>
            </div>

            <p className="mt-1 text-[12px] text-ink-secondary">
              This needs a code. Ask for one if you should have it
              {filename ? ` — it saves ${filename}` : ""}.
            </p>

            <label
              htmlFor={`code-${lessonId}`}
              className="mt-3 block text-[13px] font-semibold text-ink-secondary"
            >
              Download code
            </label>
            <input
              id={`code-${lessonId}`}
              name="code"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="K7M2-9XPQ-4H"
              className={`${INPUT} mt-1 font-mono tracking-wider uppercase`}
            />

            {state.error && (
              <p role="alert" className="mt-2 text-[12px] text-critical">
                {state.error}
              </p>
            )}

            <p className="mt-2 text-[11px] text-ink-muted">
              Your name is already recorded against this request.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAsking(false)}
                className={BTN}
              >
                Cancel
              </button>
              <button type="submit" disabled={pending} className={BTN_PRIMARY}>
                {pending ? "Checking…" : "Download"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
