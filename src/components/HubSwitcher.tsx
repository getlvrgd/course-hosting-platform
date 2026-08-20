"use client";

import { statusLabel } from "@/lib/options";

import { Menu, MenuItem } from "./Menu";

/**
 * Which offer you are looking at, and the way to another.
 *
 * The name is the button, the way an app names the workspace you are in. Rendered only
 * for somebody who works across offers — a student never sees this, and never sees
 * that other offers exist.
 */
export function HubSwitcher({
  hub,
  others,
}: {
  hub: { name: string; slug: string };
  others: { name: string; slug: string; status: string }[];
}) {
  return (
    <Menu
      label="Switch offer"
      align="left"
      trigger={
        <span className="flex items-center gap-1">
          <span className="max-w-40 truncate">{hub.name}</span>
          <span aria-hidden className="text-[9px] text-ink-muted">
            ▾
          </span>
        </span>
      }
      triggerClassName="flex shrink-0 items-center rounded-lg border border-subtle px-2.5 py-1 text-[13px] font-bold text-ink transition-colors hover:border-strong"
    >
      {(close) => (
        <>
          {others.map((other) => (
            <MenuItem
              key={other.slug}
              icon={other.slug === hub.slug ? "•" : ""}
              onClick={() => {
                close();
                window.location.href = `/h/${other.slug}`;
              }}
            >
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                <span className="truncate">{other.name}</span>
                <span className="shrink-0 text-[11px] font-semibold text-ink-muted">
                  {statusLabel(other.status)}
                </span>
              </span>
            </MenuItem>
          ))}
          <div className="my-1 border-t border-subtle" />
          <MenuItem
            icon="⌂"
            onClick={() => {
              close();
              window.location.href = "/hub";
            }}
          >
            All offers
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
