"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The `⋯` menu that hangs off a row in the outline, a course tile, and a roster row.
 *
 * Rendered into `document.body` rather than beside its button, because every place it
 * is used sits inside something that clips: the roster is a horizontal scroller, the
 * outline is a vertical one, and a tile has `overflow-hidden` for its artwork. An
 * absolutely-positioned menu is clipped by all three, so it opened *into* the row
 * instead of over the page.
 *
 * A portal costs one thing — the menu no longer travels with what it belongs to — so
 * it closes on any scroll and on a resize. That is better than following the row
 * anyway: a menu that slides around under the pointer is harder to hit than one that
 * gets out of the way.
 *
 * Closes on Escape, on a click anywhere outside it, and on choosing something.
 */
export function Menu({
  label = "More",
  align = "right",
  children,
  trigger,
  triggerClassName,
}: {
  label?: string;
  align?: "left" | "right";
  /** Rendered with `close`, so an item can dismiss the menu as it acts. */
  children: (close: () => void) => ReactNode;
  trigger?: ReactNode;
  /** Replaces the button's own classes — for a menu sitting on top of a video. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Puts the menu under its button in viewport coordinates.
   *
   * Runs as a layout effect so the measured position is applied before the browser
   * paints — the first render is deliberately invisible, because the menu has to exist
   * before its height can be read, and a menu that flashes in the top-left corner and
   * then jumps is worse than one that appears a frame later.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const menu = menuRef.current?.getBoundingClientRect();
    const width = menu?.width ?? 192;
    const height = menu?.height ?? 0;
    const GAP = 4;
    const EDGE = 8;

    // Right-aligned to the button, then pulled back inside the viewport — a menu on
    // the last column of a wide table would otherwise open off the side of the screen.
    const wanted = align === "right" ? anchor.right - width : anchor.left;
    const left = Math.max(
      EDGE,
      Math.min(wanted, window.innerWidth - width - EDGE),
    );

    // Below the button, or above it when there is no room — which is the common case
    // for the last row of a long roster.
    let top = anchor.bottom + GAP;
    if (height && top + height > window.innerHeight - EDGE) {
      const above = anchor.top - GAP - height;
      top = above > EDGE ? above : Math.max(EDGE, window.innerHeight - height - EDGE);
    }

    setSpot({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);

    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // The button toggles itself on click; closing it here too would reopen it.
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    // Pointerdown rather than click, so the menu is gone before whatever was clicked
    // underneath it starts doing its own work.
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // Capture, so a scroll inside the table or the outline counts and not just the
    // page's own. The menu is at a fixed point now and cannot follow its row.
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          // Cleared as it opens, so the first frame of this opening is hidden rather
          // than painted wherever the menu sat the last time it was used.
          setSpot(null);
          setOpen(true);
        }}
        className={
          triggerClassName ??
          "grid size-6 place-items-center rounded-md text-[13px] font-bold text-ink-muted transition-colors hover:bg-page hover:text-ink"
        }
      >
        {trigger ?? "⋯"}
      </button>

      {/* Only ever mounted from a click, so `document` is certain to exist by here. */}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: spot?.top ?? 0,
              left: spot?.left ?? 0,
              visibility: spot ? "visible" : "hidden",
            }}
            className="z-50 min-w-48 rounded-xl border border-strong bg-surface p-1 shadow-lg"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** One row in a menu. `tone="danger"` is the delete. */
export function MenuItem({
  onClick,
  children,
  tone = "normal",
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "normal" | "danger";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-page ${
        tone === "danger" ? "text-critical" : "text-ink-secondary hover:text-ink"
      }`}
    >
      {icon && (
        <span aria-hidden className="w-4 shrink-0 text-center text-[12px]">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
