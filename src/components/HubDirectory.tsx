"use client";

import { useActionState, useState, useTransition } from "react";

import {
  createHub,
  reorderHubs,
  setHubStatus,
  type HubState,
} from "@/app/actions/hubs";
import { dragWholeBlock } from "@/lib/drag";
import { STATUS } from "@/lib/options";

import { copyLink } from "./CourseEditor";
import { HubTile, type HubCard } from "./HubTile";
import { Menu, MenuItem } from "./Menu";
import { BTN, BTN_PRIMARY, INPUT, LABEL } from "./ui";

/**
 * Every offer you run, as a grid you can drag into order.
 *
 * The order is saved on drop rather than behind a Save button — any order is a
 * legitimate one, so a confirmation would only be a way to lose the change by
 * navigating away.
 */
export function HubDirectory({
  hubs,
  canCreate,
}: {
  hubs: HubCard[];
  /** Creating and deleting an offer is the owner's. */
  canCreate: boolean;
}) {
  const [items, setItems] = useState(hubs);
  const [seen, setSeen] = useState(hubs);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  const tiles = useState(() => new Map<string, HTMLDivElement>())[0];

  // The server is the truth after any action. Adjusted during render rather than in an
  // effect, so the new order paints in the same pass.
  if (seen !== hubs) {
    setSeen(hubs);
    setItems(hubs);
  }

  const move = (fromId: string, toId: string) => {
    const from = items.findIndex((hub) => hub.id === fromId);
    const to = items.findIndex((hub) => hub.id === toId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(async () => {
      await reorderHubs(next.map((hub) => hub.id));
    });
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((hub) => (
          <div
            key={hub.id}
            ref={(node) => {
              if (node) tiles.set(hub.id, node);
              else tiles.delete(hub.id);
            }}
            onDragOver={(event) => {
              if (!drag || drag === hub.id) return;
              event.preventDefault();
              setOver(hub.id);
            }}
            onDragLeave={() => setOver((c) => (c === hub.id ? null : c))}
            onDrop={(event) => {
              if (!drag) return;
              event.preventDefault();
              move(drag, hub.id);
              setDrag(null);
              setOver(null);
            }}
            className={`rounded-2xl transition-shadow ${
              over === hub.id ? "ring-2 ring-accent" : ""
            } ${drag === hub.id ? "opacity-40" : ""}`}
          >
            <HubTile hub={hub}>
              <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                <span
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    // Firefox will not start a drag without data on the transfer.
                    event.dataTransfer.setData("text/plain", hub.id);
                    dragWholeBlock(event, tiles.get(hub.id));
                    setDrag(hub.id);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  aria-hidden
                  title="Drag to reorder"
                  className="grid size-6 cursor-grab place-items-center rounded-md border border-subtle bg-surface text-[12px] text-ink-muted active:cursor-grabbing"
                >
                  ⠿
                </span>

                <span className="rounded-md border border-subtle bg-surface">
                  <Menu label={`Options for ${hub.name}`}>
                    {(close) => (
                      <>
                        <MenuItem
                          icon="✎"
                          onClick={() => {
                            close();
                            window.location.href = `/h/${hub.slug}/manage`;
                          }}
                        >
                          Open this offer
                        </MenuItem>
                        <MenuItem
                          icon={hub.status === STATUS.LIVE ? "🙈" : "👁"}
                          onClick={() => {
                            const form = new FormData();
                            form.set("hubId", hub.id);
                            form.set(
                              "status",
                              hub.status === STATUS.LIVE ? STATUS.DRAFT : STATUS.LIVE,
                            );
                            startTransition(async () => {
                              await setHubStatus(form);
                            });
                            close();
                          }}
                        >
                          {hub.status === STATUS.LIVE
                            ? "Close to students"
                            : "Open to students"}
                        </MenuItem>
                        <MenuItem
                          icon="🔗"
                          onClick={() => {
                            void copyLink(`/h/${hub.slug}`);
                            close();
                          }}
                        >
                          Copy student link
                        </MenuItem>
                        <MenuItem
                          icon="⚙"
                          onClick={() => {
                            close();
                            window.location.href = `/h/${hub.slug}/settings`;
                          }}
                        >
                          Settings
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </span>
              </div>
            </HubTile>
          </div>
        ))}

        {canCreate && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-subtle text-ink-muted transition-colors hover:border-strong hover:text-ink"
          >
            <span>
              <span aria-hidden className="block text-[24px]">
                ＋
              </span>
              <span className="mt-1 block text-[13px] font-semibold">New offer</span>
            </span>
          </button>
        )}
      </div>

      {adding && <NewHubDialog onClose={() => setAdding(false)} />}
    </>
  );
}

/**
 * A name is all it takes.
 *
 * What comes back is furnished — a first course with a first chapter, and the settings
 * every offer starts with — because pressing `+` and landing on a blank page is the
 * moment where you have to remember how all of this goes together.
 */
function NewHubDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState<HubState, FormData>(
    createHub,
    {},
  );

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="New offer"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        action={formAction}
        className="w-full max-w-md rounded-2xl border border-strong bg-surface p-4 shadow-xl"
      >
        <h2 className="text-[16px]">New offer</h2>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Its own courses, its own students, its own logins and settings. It starts as a
          draft with one course ready to fill in — nobody sees it until you open it.
        </p>

        <label htmlFor="hub-name" className={`${LABEL} mt-3`}>
          Name
        </label>
        <input
          id="hub-name"
          name="name"
          required
          autoFocus
          placeholder="YouTube Automation"
          className={`${INPUT} mt-1`}
        />

        {state.error && (
          <p role="alert" className="mt-2 text-[13px] text-critical">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>
            {pending ? "Creating…" : "Create offer"}
          </button>
        </div>
      </form>
    </div>
  );
}
