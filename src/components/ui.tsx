import { tintVars } from "@/lib/options";

/**
 * The handful of shapes every page repeats: a surface card, a pill, a person chip, a
 * progress bar. Kept in one file so a change to the card's radius or the pill's
 * padding happens once rather than in eleven places.
 *
 * Class strings rather than components where the thing is only a class — a `<button>`
 * needs its own type, form and disabled handling, and wrapping that costs more than it
 * saves.
 */

export const CARD = "rounded-2xl border border-subtle bg-surface p-4 sm:p-5";

export const INPUT =
  "w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[13px] font-bold text-page transition-opacity hover:opacity-90 disabled:opacity-60";

export const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-strong hover:text-ink disabled:opacity-60";

export const BTN_QUIET =
  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-ink-secondary transition-colors hover:bg-page hover:text-ink";

export const BTN_DANGER =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-critical hover:text-critical disabled:opacity-60";

export const LABEL = "block text-[13px] font-semibold text-ink-secondary";

export const HINT = "mt-1 text-[12px] text-ink-muted";

/**
 * The bar under every course tile and beside every name on the students tab.
 *
 * The figure is written inside the bar rather than beside it, which is what the design
 * these were drawn from does — and it means a row of tiles has one column of text
 * rather than two. The number is ink, never the tint: colour groups the courses, it
 * never carries the reading.
 */
export function ProgressBar({
  value,
  accent,
  label,
}: {
  /** Whole percent, 0–100. */
  value: number;
  accent?: string | null;
  /** Overrides the "0%" written inside — for "12 of 30" and the like. */
  label?: string;
}) {
  const tint = tintVars(accent);
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="relative h-7 w-full overflow-hidden rounded-full border border-subtle bg-page"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-300"
        style={{
          width: `${clamped}%`,
          background: tint?.fill ?? "var(--accent-soft)",
        }}
      />
      <span className="tabular relative flex h-full items-center px-3 text-[12px] font-bold text-ink">
        {label ?? `${clamped}%`}
      </span>
    </div>
  );
}

/** The slim version, for a table row where a 28px bar would be too loud. */
export function ProgressLine({
  value,
  accent,
}: {
  value: number;
  accent?: string | null;
}) {
  const tint = tintVars(accent);
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-page">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${clamped}%`,
            background: tint?.outline ?? "var(--accent)",
          }}
        />
      </span>
      <span className="tabular text-[12px] font-bold text-ink">{clamped}%</span>
    </span>
  );
}

/** A tinted chip: a course kind, a role, a lesson type. */
export function Chip({
  color,
  children,
  title,
}: {
  color?: string | null;
  children: React.ReactNode;
  title?: string;
}) {
  const tint = tintVars(color);
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold"
      style={
        tint
          ? { background: tint.fill, borderColor: tint.edge, color: "var(--text-primary)" }
          : {
              background: "var(--surface-page)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }
      }
    >
      {children}
    </span>
  );
}

/** The little round person mark beside a name. */
export function Avatar({
  name,
  color,
  size = 24,
  title,
}: {
  name: string;
  color?: string | null;
  size?: number;
  title?: string;
}) {
  const tint = tintVars(color);
  return (
    <span
      title={title ?? name}
      className="inline-grid shrink-0 place-items-center rounded-full border font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: tint?.fill ?? "var(--surface-page)",
        borderColor: tint?.edge ?? "var(--border-subtle)",
        color: "var(--text-primary)",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Published or hidden, as a dot and a word. */
export function VisibilityPill({ visibility }: { visibility: string }) {
  const hidden = visibility !== "PUBLISHED";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-secondary">
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{
          background: hidden ? "var(--text-muted)" : "var(--status-good)",
        }}
      />
      {hidden ? "Hidden" : "Published"}
    </span>
  );
}

/** An empty state that says what to do next rather than just "nothing here". */
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-subtle px-5 py-8 text-center">
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {children && (
        <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-secondary">
          {children}
        </p>
      )}
    </div>
  );
}

/**
 * "3 days ago", "Today" — every date in the app reads the same way.
 *
 * `now` is passed in rather than read here. Reading the clock while rendering makes a
 * component that answers differently on the server and on the client, which is exactly
 * the hydration mismatch this app would otherwise hit on every roster row — and it
 * means a page full of dates is all measured against one instant rather than each row
 * against its own.
 */
export function Ago({ date, now }: { date: Date | string | null; now: number }) {
  if (!date) return <span className="text-ink-muted">Never</span>;
  const when = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((now - when.getTime()) / 86_400_000);
  const text =
    days <= 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : days < 30
          ? `${days} days ago`
          : when.toLocaleDateString();
  return (
    <time dateTime={when.toISOString()} title={when.toLocaleString()}>
      {text}
    </time>
  );
}
