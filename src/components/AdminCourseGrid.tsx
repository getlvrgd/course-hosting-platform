"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  createCourse,
  reorderCourses,
  setCourseVisibility,
  type CourseState,
} from "@/app/actions/courses";
import type { CourseCard } from "@/lib/catalog-types";
import { dragWholeBlock } from "@/lib/drag";

import { copyLink } from "./CourseEditor";
import { CourseTile } from "./CourseTile";
import { Menu, MenuItem } from "./Menu";
import { BTN, BTN_PRIMARY, INPUT, LABEL } from "./ui";

/**
 * The manage grid: every course, in the order they appear to students, dragged into
 * whatever order that should be.
 *
 * The order is saved on drop rather than behind a Save button. There is no half-valid
 * arrangement to protect against — any order is a legitimate one — so asking for a
 * confirmation would only be a way to lose the change by navigating away.
 */
export function AdminCourseGrid({
  courses,
  hubId,
  slug,
  canDelete,
}: {
  courses: CourseCard[];
  /** The offer these belong to. Every write is checked against it on the server. */
  hubId: string;
  slug: string;
  /** Deleting a course outright is the owner's. */
  canDelete: boolean;
}) {
  const [items, setItems] = useState(courses);
  const [seen, setSeen] = useState(courses);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  // Each tile's outer element, kept so the drag image can be the whole tile rather
  // than the handle the drag started on.
  const tiles = useRef(new Map<string, HTMLDivElement>());

  // The server is the truth after any action — publishing one, deleting one. Adjusted
  // during render rather than in an effect, so the new order paints in the same pass
  // instead of one frame of the stale one followed by a second render.
  if (seen !== courses) {
    setSeen(courses);
    setItems(courses);
  }

  const move = (fromId: string, toId: string) => {
    const from = items.findIndex((course) => course.id === fromId);
    const to = items.findIndex((course) => course.id === toId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(async () => {
      await reorderCourses(hubId, next.map((course) => course.id));
    });
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((course) => (
          <div
            key={course.id}
            ref={(node) => {
              if (node) tiles.current.set(course.id, node);
              else tiles.current.delete(course.id);
            }}
            onDragOver={(event) => {
              if (!drag || drag === course.id) return;
              event.preventDefault();
              setOver(course.id);
            }}
            onDragLeave={() =>
              setOver((current) => (current === course.id ? null : current))
            }
            onDrop={(event) => {
              if (!drag) return;
              event.preventDefault();
              move(drag, course.id);
              setDrag(null);
              setOver(null);
            }}
            className={`rounded-2xl transition-shadow ${
              over === course.id ? "ring-2 ring-accent" : ""
            } ${drag === course.id ? "opacity-40" : ""}`}
          >
            <CourseTile course={course} href={`/h/${slug}/manage/${course.id}`}>
              <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                <span
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    // Firefox will not start a drag without data on the transfer.
                    event.dataTransfer.setData("text/plain", course.id);
                    dragWholeBlock(event, tiles.current.get(course.id));
                    setDrag(course.id);
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
                  <Menu label={`Options for ${course.title}`}>
                    {(close) => (
                      <>
                        <MenuItem
                          icon="✎"
                          onClick={() => {
                            close();
                            window.location.href = `/h/${slug}/manage/${course.id}`;
                          }}
                        >
                          Edit course
                        </MenuItem>
                        <MenuItem
                          icon={course.visibility === "PUBLISHED" ? "🙈" : "👁"}
                          onClick={() => {
                            const form = new FormData();
                            form.set("courseId", course.id);
                            form.set(
                              "visibility",
                              course.visibility === "PUBLISHED"
                                ? "HIDDEN"
                                : "PUBLISHED",
                            );
                            startTransition(async () => {
                              await setCourseVisibility(form);
                            });
                            close();
                          }}
                        >
                          {course.visibility === "PUBLISHED"
                            ? "Hide from students"
                            : "Publish to students"}
                        </MenuItem>
                        <MenuItem
                          icon="🔗"
                          onClick={() => {
                            void copyLink(`/h/${slug}/c/${course.slug}`);
                            close();
                          }}
                        >
                          Copy student link
                        </MenuItem>
                        {canDelete && (
                          <MenuItem
                            icon="🗑"
                            tone="danger"
                            onClick={() => {
                              close();
                              // Deleting takes the typed name, which is asked for on
                              // the course's own page rather than in a menu.
                              window.location.href = `/h/${slug}/manage/${course.id}#danger`;
                            }}
                          >
                            Delete course
                          </MenuItem>
                        )}
                      </>
                    )}
                  </Menu>
                </span>
              </div>
            </CourseTile>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-subtle text-ink-muted transition-colors hover:border-strong hover:text-ink"
        >
          <span>
            <span aria-hidden className="block text-[24px]">
              ＋
            </span>
            <span className="mt-1 block text-[13px] font-semibold">Add course</span>
          </span>
        </button>
      </div>

      {adding && <NewCourseDialog hubId={hubId} onClose={() => setAdding(false)} />}
    </>
  );
}

/** A name is all it takes. Everything else is edited inside the course. */
function NewCourseDialog({ hubId, onClose }: { hubId: string; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<CourseState, FormData>(
    createCourse,
    {},
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="New course"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        action={formAction}
        className="w-full max-w-md rounded-2xl border border-strong bg-surface p-4 shadow-xl"
      >
        <input type="hidden" name="hubId" value={hubId} />
        <h2 className="text-[16px]">New course</h2>
        <p className="mt-1 text-[12px] text-ink-secondary">
          It starts hidden, with one empty chapter. Publish it when it&apos;s ready.
        </p>

        <label htmlFor="course-title" className={`${LABEL} mt-3`}>
          Name
        </label>
        <input
          id="course-title"
          name="title"
          required
          autoFocus
          placeholder="AI Foundations"
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
            {pending ? "Creating…" : "Create course"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Shown above the grid, so the empty state is not the only way in. */
export function GridHint({ count, slug }: { count: number; slug: string }) {
  if (count === 0) return null;
  return (
    <p className="text-[12px] text-ink-muted">
      Drag a tile by its <span aria-hidden>⠿</span> handle to change the order students
      see. <Link href={`/h/${slug}`} className="text-accent underline underline-offset-2">
        Check the student view
      </Link>{" "}
      any time.
    </p>
  );
}
