"use client";

import { useRef, type ReactNode } from "react";

/**
 * Light formatting for the written parts of a hub.
 *
 * Text is stored as plain text with markers — **bold**, *italic*, __underline__ —
 * rather than as HTML. That means the renderer builds React elements instead of
 * injecting markup, so nothing typed into a hub can turn into script when a rep
 * reads it, and the stored value stays legible if it is ever read straight out of
 * the database.
 */

const MARKS: [string, "strong" | "em" | "u"][] = [
  ["**", "strong"],
  ["__", "u"],
  ["*", "em"],
  ["_", "em"],
];

/**
 * Only ever produce links a browser should follow.
 *
 * Anything that isn't http, https or mailto — `javascript:` above all — comes back
 * null and is rendered as ordinary text instead of becoming a clickable trap.
 */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^www\./i.test(url)) return `https://${url}`;
  try {
    const { protocol } = new URL(url);
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  );
}

// A bare URL, stopping before whitespace or a closing bracket.
const BARE_URL = /^(https?:\/\/|www\.)[^\s<>()[\]]+/i;
// [Label](https://…) — the label may itself carry bold or italics.
const LABELLED = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;

function parse(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) {
      out.push(buffer);
      buffer = "";
    }
  };

  while (i < text.length) {
    let matched = false;

    // Links are resolved before the emphasis marks, so underscores and asterisks
    // inside a URL stay part of the address instead of turning into italics.
    if (text[i] === "[") {
      const m = LABELLED.exec(text.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        if (href) {
          flush();
          out.push(
            <Anchor key={out.length} href={href}>
              {parse(m[1])}
            </Anchor>,
          );
          i += m[0].length;
          continue;
        }
      }
    }

    const bare = BARE_URL.exec(text.slice(i));
    if (bare) {
      // Trailing sentence punctuation belongs to the sentence, not the address.
      const raw = bare[0].replace(/[.,;:!?]+$/, "");
      const href = safeHref(raw);
      if (href) {
        flush();
        out.push(
          <Anchor key={out.length} href={href}>
            {raw}
          </Anchor>,
        );
        i += raw.length;
        continue;
      }
    }

    for (const [marker, tag] of MARKS) {
      if (!text.startsWith(marker, i)) continue;

      // Underscores inside a word are just part of the word — snake_case_name and
      // the like stay literal.
      const underscore = marker[0] === "_";
      if (underscore && /\w/.test(text[i - 1] ?? "")) continue;

      const close = text.indexOf(marker, i + marker.length);
      if (close === -1) continue;

      const inner = text.slice(i + marker.length, close);
      if (!inner.trim()) continue; // "**" or "** **" is just characters

      const padLeft = inner.length - inner.trimStart().length;
      const padRight = inner.length - inner.trimEnd().length;

      // Doubled markers are unambiguous — nobody writes "2 ** 3" — so ⌘B always
      // wins, however much whitespace got swept into the selection.
      //
      // Single markers do collide with real writing: "$5,000 * 3 payments" and
      // snake_case. There, a pair padded on *both* sides is taken as ordinary
      // punctuation rather than formatting.
      if (marker.length === 1 && padLeft > 0 && padRight > 0) continue;
      if (underscore && /\w/.test(text[close + marker.length] ?? "")) continue;

      flush();
      // Whitespace the user swept into the selection belongs outside the tag, so
      // "**bold **" renders as bold followed by a space rather than a bold space.
      if (padLeft) out.push(" ".repeat(padLeft));
      const Tag = tag;
      out.push(<Tag key={out.length}>{parse(inner.trim())}</Tag>);
      if (padRight) out.push(" ".repeat(padRight));
      i = close + marker.length;
      matched = true;
      break;
    }

    if (!matched) {
      buffer += text[i];
      i += 1;
    }
  }

  if (buffer) out.push(buffer);
  return out;
}

/** Renders one run of text. Blank lines are handled by the caller. */
export function Formatted({ text }: { text: string }) {
  return <>{parse(text)}</>;
}

/**
 * A whole body of text.
 *
 * Parsed in one pass rather than split into paragraphs first: an underline opened
 * on one line and closed several lines later is a completely ordinary thing to
 * write, and splitting first left both markers stranded and showing as characters.
 * Line breaks and blank lines are preserved by `whitespace-pre-line`, so the text
 * still looks the way it was typed.
 */
export function FormattedBody({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`text-[14px] leading-relaxed whitespace-pre-line ${className}`}
    >
      <Formatted text={text.trim()} />
    </div>
  );
}

/* ---------------------------------------------------------------- editing -- */

const SHORTCUTS: Record<string, string> = { b: "**", i: "*", u: "__" };

/**
 * Wraps (or unwraps) the current selection in a marker. Shared by the multi-line
 * editor and the single-line inputs so ⌘B behaves the same wherever you are.
 */
function toggleMarker(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  marker: string,
  onChange: (value: string) => void,
) {
  const { selectionStart, selectionEnd } = el;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  const wrapped =
    before.endsWith(marker) && after.startsWith(marker) && selected.length > 0;

  if (wrapped) {
    onChange(before.slice(0, -marker.length) + selected + after.slice(marker.length));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start - marker.length, end - marker.length);
    });
    return;
  }

  onChange(before + marker + selected + marker + after);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + marker.length, end + marker.length);
  });
}

/**
 * Wraps the selection as a labelled link and leaves the caret inside the brackets
 * where the address goes, so ⌘K then paste is the whole gesture.
 */
function insertLink(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  onChange: (value: string) => void,
) {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  const selected = value.slice(start, end) || "link text";
  const next = `${value.slice(0, start)}[${selected}](url)${value.slice(end)}`;
  onChange(next);
  // Select the word "url" so pasting replaces it.
  const urlStart = start + selected.length + 3;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(urlStart, urlStart + 3);
  });
}

/** A one-line field that still understands ⌘B / ⌘I / ⌘U. */
export function RichInput({
  value,
  onChange,
  placeholder,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey || !ref.current) return;
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          insertLink(ref.current, value, onChange);
          return;
        }
        const marker = SHORTCUTS[e.key.toLowerCase()];
        if (!marker) return;
        e.preventDefault();
        toggleMarker(ref.current, value, marker, onChange);
      }}
      className={
        className ||
        "w-full rounded-md border border-subtle bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent"
      }
    />
  );
}

/**
 * A textarea that understands ⌘B / ⌘I / ⌘U (and Ctrl on Windows).
 *
 * Pressing a shortcut with nothing selected inserts the pair and puts the caret
 * between them, so you can hit ⌘B and just start typing.
 */
export function RichTextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const applyMarker = (marker: string) => {
    if (ref.current) toggleMarker(ref.current, value, marker, onChange);
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        {label && (
          <span className="mr-auto block text-[10px] font-bold tracking-widest text-ink-muted uppercase">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={() => applyMarker("**")}
          title="Bold (⌘B)"
          aria-label="Bold"
          className="h-6 w-6 rounded border border-subtle text-[11px] font-bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => applyMarker("*")}
          title="Italic (⌘I)"
          aria-label="Italic"
          className="h-6 w-6 rounded border border-subtle text-[11px] italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => applyMarker("__")}
          title="Underline (⌘U)"
          aria-label="Underline"
          className="h-6 w-6 rounded border border-subtle text-[11px] underline"
        >
          U
        </button>
        <button
          type="button"
          onClick={() => ref.current && insertLink(ref.current, value, onChange)}
          title="Link with your own wording (⌘K)"
          aria-label="Insert link"
          className="h-6 rounded border border-subtle px-1.5 text-[11px]"
        >
          🔗
        </button>
      </div>

      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
          if (e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (ref.current) insertLink(ref.current, value, onChange);
            return;
          }
          const marker = SHORTCUTS[e.key.toLowerCase()];
          if (!marker) return;
          e.preventDefault();
          applyMarker(marker);
        }}
        className={`w-full rounded-md border border-subtle bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent ${className}`}
      />
    </div>
  );
}
