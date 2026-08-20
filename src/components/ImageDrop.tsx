"use client";

import { useId, useRef, useState } from "react";

/**
 * An image dropped straight off the desktop.
 *
 * There is no file store behind this app, so the picture is carried as its own bytes:
 * shrunk in the browser and handed to the form as a data URL, which the action writes
 * alongside everything else about the piece. That is the whole reason for the resize —
 * a 4MB screenshot straight off a phone would be 5MB of base64 in a database row and
 * on every page load, where 720px of JPEG is 40KB and looks identical at the size it
 * is ever shown.
 *
 * Drop it, paste it, or click to browse. All three end in the same place.
 */

/** Wide enough for a thumbnail read at card size, small enough to store inline. */
const MAX_WIDTH = 720;
const QUALITY = 0.82;

/** Refused before the resize, so a dropped video never becomes a canvas the size of it. */
const MAX_SOURCE_BYTES = 12_000_000;

export function ImageDrop({
  name,
  value,
  onChange,
  hint = "Drag an image in, paste it, or click to choose",
}: {
  /** Posted under this name, so a plain form action picks it up. */
  name: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("That isn't an image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That file is enormous — try an export rather than the original.");
      return;
    }

    setBusy(true);
    try {
      onChange(await shrink(file));
    } catch {
      setError("That image couldn't be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* The value the form actually posts. The box below is only how it gets set. */}
      <input type="hidden" name={name} value={value} />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void take(event.dataTransfer.files[0]);
        }}
        onPaste={(event) => {
          const file = event.clipboardData.files[0];
          if (file) {
            event.preventDefault();
            void take(file);
          }
        }}
        className={`rounded-xl border border-dashed p-2 transition-colors ${
          over ? "border-accent bg-accent-soft" : "border-subtle"
        }`}
      >
        {value ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="What will be saved"
              className="h-14 w-24 shrink-0 rounded-md border border-subtle object-cover"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-secondary hover:border-strong hover:text-ink"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange("")}
                className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-muted hover:border-critical hover:text-critical"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer items-center justify-center gap-2 px-2 py-4 text-center text-[12px] text-ink-muted"
          >
            {busy ? "Reading the image…" : hint}
          </label>
        )}

        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void take(event.target.files?.[0]);
            // Cleared so choosing the same file twice in a row still fires.
            event.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-1 text-[12px] text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

/** Draws the file into a canvas no wider than MAX_WIDTH and reads it back as JPEG. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // JPEG rather than PNG: a screenshot of a thumbnail is a photograph, and PNG of
    // one is several times the size for no visible gain.
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}
