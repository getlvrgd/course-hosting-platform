"use client";

import { useActionState, useState } from "react";

import { deleteHub, saveHubSettings, type HubState } from "@/app/actions/hubs";
import type { HubRecord } from "@/lib/access";
import { STATUSES, TINTS, tintVars } from "@/lib/options";

import { ImageDrop } from "./ImageDrop";
import { BTN, BTN_PRIMARY, HINT, INPUT, LABEL } from "./ui";

/**
 * The offer's own fields: its name, its art, its URL, and whether it is open.
 *
 * Folded away by default. Nine times in ten somebody opening Settings came for the
 * download options, and a rename form sitting on top would push those off the screen.
 */
export function HubSettings({
  hub,
  canDelete,
}: {
  hub: HubRecord;
  /** Deleting an offer outright is the owner's. */
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<HubState, FormData>(
    saveHubSettings,
    {},
  );
  const [thumb, setThumb] = useState(hub.thumbnailUrl ?? "");
  const [accent, setAccent] = useState(hub.accent);

  if (!open) {
    return (
      <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px]">{hub.name}</h2>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              /h/{hub.slug} · {hub.status.toLowerCase()}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className={BTN}>
            Rename or close this offer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
      <form action={formAction}>
        <input type="hidden" name="slug_current" value={hub.slug} />
        <input type="hidden" name="accent" value={accent} />

        <h2 className="text-[16px]">This offer</h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hub-name" className={LABEL}>
              Name
            </label>
            <input
              id="hub-name"
              name="name"
              defaultValue={hub.name}
              required
              className={`${INPUT} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="hub-slug" className={LABEL}>
              URL
            </label>
            <div className="mt-1 flex items-center gap-1">
              <span className="shrink-0 text-[13px] text-ink-muted">/h/</span>
              <input
                id="hub-slug"
                name="slug"
                defaultValue={hub.slug}
                className={INPUT}
              />
            </div>
            <p className={HINT}>
              Changing this breaks every link already sent to this offer&apos;s students.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="hub-description" className={LABEL}>
              The line under the name
            </label>
            <textarea
              id="hub-description"
              name="description"
              rows={2}
              defaultValue={hub.description ?? ""}
              placeholder="Everything a new client needs, in order."
              className={`${INPUT} mt-1`}
            />
          </div>

          <div>
            <span className={LABEL}>Tile artwork</span>
            <div className="mt-1">
              <ImageDrop
                name="thumbnailUrl"
                value={thumb}
                onChange={setThumb}
                hint="Drag the tile image in, paste it, or click to choose"
              />
            </div>
          </div>

          <div>
            <span className={LABEL}>Tint</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TINTS.map((tint) => {
                const vars = tintVars(tint.value);
                const on = accent === tint.value;
                return (
                  <button
                    key={tint.value}
                    type="button"
                    onClick={() => setAccent(tint.value)}
                    aria-pressed={on}
                    aria-label={tint.label}
                    title={tint.label}
                    className="size-7 rounded-lg border-2 transition-transform hover:scale-105"
                    style={{
                      background: vars?.fill,
                      borderColor: on ? vars?.outline : "transparent",
                    }}
                  />
                );
              })}
            </div>

            <div className="mt-4">
              <label htmlFor="hub-status" className={LABEL}>
                Who can get in
              </label>
              <select
                id="hub-status"
                name="status"
                defaultValue={hub.status}
                className={`${INPUT} mt-1`}
              >
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className={HINT}>
                Draft and archived both close it to students. You keep access either way.
              </p>
            </div>
          </div>
        </div>

        {state.error && (
          <p role="alert" className="mt-3 text-[13px] text-critical">
            {state.error}
          </p>
        )}
        {state.ok && !pending && (
          <p className="mt-3 text-[13px] text-good">{state.ok}</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={BTN}>
            Close
          </button>
        </div>
      </form>

      {canDelete && (
        <div className="mt-6 border-t border-subtle pt-4">
          <h3 className="text-[14px]">Delete this offer</h3>
          <p className="mt-1 max-w-xl text-[12px] text-ink-secondary">
            Removes the offer, its courses, its lessons, its students and their
            progress, and its download log. Uploaded videos stay in storage. Type{" "}
            <span className="font-bold text-ink">{hub.name}</span> to confirm.
          </p>
          <form action={deleteHub} className="mt-2 flex max-w-md items-center gap-2">
            <input type="hidden" name="hubId" value={hub.id} />
            <input
              name="confirm"
              aria-label="Type the offer name to confirm"
              placeholder={hub.name}
              className={INPUT}
            />
            <button
              type="submit"
              className="shrink-0 rounded-full border border-subtle px-3 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-critical hover:text-critical"
            >
              Delete
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
