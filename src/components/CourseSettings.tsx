"use client";

import { useActionState, useState } from "react";

import { saveCourseSettings, type CourseState } from "@/app/actions/courses";
import type { CourseTree } from "@/lib/course";
import { TINTS, VISIBILITIES, tintVars } from "@/lib/options";

import { ImageDrop } from "./ImageDrop";
import { BTN, BTN_PRIMARY, HINT, INPUT, LABEL } from "./ui";

/**
 * The course's own fields, as opposed to what is inside it: the name on the tile, the
 * art, the tint, the URL, and whether students can see it at all.
 *
 * Folded away by default. Nine times in ten the reason someone opened a course is to
 * work on a lesson, and a settings form sitting above the outline would push the work
 * off the screen.
 */
export function CourseSettings({ course }: { course: CourseTree }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CourseState, FormData>(
    saveCourseSettings,
    {},
  );
  const [thumb, setThumb] = useState(course.thumbnailUrl ?? "");
  const [accent, setAccent] = useState(course.accent);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN}>
        Course settings
      </button>
    );
  }

  return (
    <div className="w-full">
      <form
        action={formAction}
        className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5"
      >
        <input type="hidden" name="courseId" value={course.id} />
        <input type="hidden" name="accent" value={accent} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="title" className={LABEL}>
              Name
            </label>
            <input
              id="title"
              name="title"
              defaultValue={course.title}
              required
              className={`${INPUT} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="slug" className={LABEL}>
              URL
            </label>
            <div className="mt-1 flex items-center gap-1">
              <span className="shrink-0 text-[13px] text-ink-muted">/courses/</span>
              <input
                id="slug"
                name="slug"
                defaultValue={course.slug}
                className={INPUT}
              />
            </div>
            <p className={HINT}>
              Changing this breaks links already sent out. Renaming the course does not
              touch it.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="description" className={LABEL}>
              The line under the name
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={course.description ?? ""}
              placeholder="Your journey begins here. Watch this to pick the right pathway for you!"
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
            <p className={HINT}>Colours the progress bar, and the tile before art.</p>
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
              <label htmlFor="visibility" className={LABEL}>
                Who can see it
              </label>
              <select
                id="visibility"
                name="visibility"
                defaultValue={course.visibility}
                className={`${INPUT} mt-1`}
              >
                {VISIBILITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
            {pending ? "Saving…" : "Save settings"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={BTN}>
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
