"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
  moveChapter,
  moveLesson,
  renameChapter,
  saveLesson,
  type LessonPatchInput,
} from "@/app/actions/courses";
import { dragWholeBlock } from "@/lib/drag";
import {
  formatLessonLength,
  lessonKindLabel,
  LESSON_KIND_OPTIONS,
  type CourseTree,
  type LessonKind,
  type LessonNode,
} from "@/lib/course";

import { LessonPane } from "./LessonPane";
import { LessonThumb } from "./LessonThumb";
import { Menu, MenuItem } from "./Menu";
import { BTN, BTN_PRIMARY } from "./ui";

/**
 * The course, as the owner builds it: an outline on the left, one lesson on the right.
 *
 * The whole tree is held here in state and handed down, which is what makes dragging a
 * lesson into another chapter feel instant — the move is applied locally the moment it
 * is dropped, and the server's answer replaces the tree a beat later. Everything
 * structural comes back as a whole tree for exactly that reason: the database is the
 * arbiter of what the outline is, so a dropped lesson can never end up in two places
 * on screen and one in the row.
 *
 * Field edits are the other shape. They save on a debounce while you type and return
 * only whether they landed, because shipping a whole tree back on every keystroke
 * would fight the caret.
 */

type SaveState = "idle" | "saving" | "saved" | "error";

export function CourseEditor({
  initial,
  hubId,
  basePath,
  blob,
  canUpload,
}: {
  initial: CourseTree;
  /** The offer this course belongs to — scopes the "paste from another lesson" list. */
  hubId: string;
  /** Where a lesson lives for a student, e.g. /h/main/c/start-here. */
  basePath: string;
  /** Whether uploads go straight to blob storage or to the local dev disk. */
  blob: boolean;
  /** False where this deployment has nowhere to put a file — see uploadsPossible. */
  canUpload: boolean;
}) {
  const [tree, setTree] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.chapters.flatMap((chapter) => chapter.lessons)[0]?.id ?? null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, startTransition] = useTransition();

  // The course this editor was opened on. Navigating to another one, or the page
  // revalidating, makes the incoming tree the truth rather than what is in state —
  // adjusted during render, so there is no pass that paints the previous course.
  if (seen !== initial) {
    setSeen(initial);
    setTree(initial);
  }

  /* ------------------------------------------------------------- debounced save -- */

  const queued = useRef<{ lessonId: string; patch: LessonPatchInput } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const job = queued.current;
    queued.current = null;
    if (!job) return;

    setSaveState("saving");
    try {
      const result = await saveLesson(job.lessonId, job.patch);
      setSaveState(result.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, []);

  /**
   * Applies an edit to the lesson on screen and queues it for the database.
   *
   * Patches for the same lesson are merged, so typing a title and then attaching a
   * video half a second later is one write with both in it. A patch for a *different*
   * lesson flushes the pending one first — otherwise switching lessons mid-sentence
   * would drop the sentence.
   */
  const patchLesson = useCallback(
    (lessonId: string, patch: LessonPatchInput, immediate = false) => {
      setTree((current) => ({
        ...current,
        chapters: current.chapters.map((chapter) => ({
          ...chapter,
          lessons: chapter.lessons.map((lesson) =>
            lesson.id === lessonId ? { ...lesson, ...patch } : lesson,
          ) as LessonNode[],
        })),
      }));

      if (queued.current && queued.current.lessonId !== lessonId) {
        void flush();
      }
      queued.current = {
        lessonId,
        patch: { ...(queued.current?.lessonId === lessonId ? queued.current.patch : {}), ...patch },
      };

      if (timer.current) clearTimeout(timer.current);
      // Immediate for a click — a video attached, a file removed. For typing, just
      // long enough to batch a burst of keystrokes into one write; the write itself
      // is a couple of milliseconds, so there is nothing to be gained by waiting.
      timer.current = setTimeout(() => void flush(), immediate ? 0 : 350);
    },
    [flush],
  );

  // A half-typed sentence must not be lost to a navigation.
  useEffect(() => () => void flush(), [flush]);

  const select = (lessonId: string | null) => {
    void flush();
    setSelectedId(lessonId);
  };

  /* -------------------------------------------------------------------- actions -- */

  const run = (work: () => Promise<{ tree: CourseTree | null }>) => {
    startTransition(async () => {
      const result = await work();
      if (result.tree) setTree(result.tree);
    });
  };

  const onAddChapter = () => run(() => addChapter(tree.id));

  const onAddLesson = (chapterId: string, kind: LessonKind) => {
    void flush();
    startTransition(async () => {
      const result = await addLesson(chapterId, kind);
      if (result.tree) setTree(result.tree);
      // Opened straight away, because the next thing anyone does is give it a name.
      if (result.lessonId) setSelectedId(result.lessonId);
    });
  };

  const onDeleteLesson = (lessonId: string) => {
    if (selectedId === lessonId) setSelectedId(null);
    queued.current = null;
    run(() => deleteLesson(lessonId));
  };

  /* ----------------------------------------------------------------- the outline -- */

  const lessons = tree.chapters.flatMap((chapter) => chapter.lessons);
  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? null;
  const chapterOf = tree.chapters.find((chapter) =>
    chapter.lessons.some((lesson) => lesson.id === selectedId),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Outline
        tree={tree}
        selectedId={selectedId}
        onSelect={select}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        onAddChapter={onAddChapter}
        onAddLesson={onAddLesson}
        onDeleteLesson={onDeleteLesson}
        onDeleteChapter={(chapterId) => run(() => deleteChapter(chapterId))}
        onRenameChapter={(chapterId, title) => {
          setTree((current) => ({
            ...current,
            chapters: current.chapters.map((chapter) =>
              chapter.id === chapterId ? { ...chapter, title } : chapter,
            ),
          }));
          void renameChapter(chapterId, title);
        }}
        onMoveLesson={(lessonId, toChapterId, toIndex) =>
          run(() => moveLesson(lessonId, toChapterId, toIndex))
        }
        onMoveChapter={(chapterId, toIndex) => run(() => moveChapter(chapterId, toIndex))}
        busy={busy}
        basePath={basePath}
      />

      <div className="min-w-0 flex-1">
        {selected ? (
          <LessonPane
            key={selected.id}
            lesson={selected}
            chapterIndex={tree.chapters.indexOf(chapterOf!) + 1}
            basePath={basePath}
            hubId={hubId}
            blob={blob}
            canUpload={canUpload}
            saveState={saveState}
            onPatch={patchLesson}
            onFlush={flush}
            onDelete={() => onDeleteLesson(selected.id)}
          />
        ) : (
          <div className="grid h-full place-items-center px-6 py-16">
            <div className="max-w-sm text-center">
              <p className="text-[15px] font-bold text-ink">No lesson open</p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                Pick one from the outline, or add a lesson to a chapter with the{" "}
                <span className="font-bold">+</span> beside its name.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- outline -- */

type DragState =
  | { kind: "lesson"; id: string }
  | { kind: "chapter"; id: string }
  | null;

function Outline({
  tree,
  selectedId,
  onSelect,
  collapsed,
  setCollapsed,
  onAddChapter,
  onAddLesson,
  onDeleteLesson,
  onDeleteChapter,
  onRenameChapter,
  onMoveLesson,
  onMoveChapter,
  busy,
  basePath,
}: {
  tree: CourseTree;
  selectedId: string | null;
  onSelect: (lessonId: string) => void;
  collapsed: Set<string>;
  setCollapsed: (next: Set<string>) => void;
  onAddChapter: () => void;
  onAddLesson: (chapterId: string, kind: LessonKind) => void;
  onDeleteLesson: (lessonId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onRenameChapter: (chapterId: string, title: string) => void;
  onMoveLesson: (lessonId: string, toChapterId: string, toIndex: number) => void;
  onMoveChapter: (chapterId: string, toIndex: number) => void;
  busy: boolean;
  basePath: string;
}) {
  const [drag, setDrag] = useState<DragState>(null);
  const [overChapter, setOverChapter] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // Each chapter's own block, so dragging one shows the chapter rather than the ⠿.
  const blocks = useRef(new Map<string, HTMLElement>());

  const toggle = (chapterId: string) => {
    const next = new Set(collapsed);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    setCollapsed(next);
  };

  return (
    <aside className="shrink-0 border-b border-subtle lg:w-[320px] lg:border-r lg:border-b-0">
      <div className="flex max-h-[calc(100vh-8rem)] flex-col overflow-y-auto p-3">
        {tree.chapters.map((chapter, chapterIndex) => (
          <section
            key={chapter.id}
            ref={(node) => {
              if (node) blocks.current.set(chapter.id, node);
              else blocks.current.delete(chapter.id);
            }}
            onDragOver={(event) => {
              if (!drag) return;
              event.preventDefault();
              setOverChapter(chapter.id);
            }}
            onDragLeave={(event) => {
              // Only when the pointer has actually left the block, not when it crosses
              // one of the rows inside it.
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setOverChapter((current) => (current === chapter.id ? null : current));
              }
            }}
            onDrop={(event) => {
              if (!drag) return;
              event.preventDefault();
              if (drag.kind === "lesson") {
                // Dropped on the chapter itself rather than on one of its lessons:
                // that means the end of it.
                onMoveLesson(drag.id, chapter.id, chapter.lessons.length);
              } else {
                onMoveChapter(drag.id, chapterIndex);
              }
              setDrag(null);
              setOverChapter(null);
            }}
            className={`mb-2 rounded-xl border transition-colors ${
              overChapter === chapter.id ? "border-accent" : "border-subtle"
            } ${drag?.kind === "chapter" && drag.id === chapter.id ? "opacity-40" : ""}`}
          >
            <header className="flex items-center gap-1 px-2 py-1.5">
              <span
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  // Firefox will not start a drag without data on the transfer.
                  event.dataTransfer.setData("text/plain", chapter.id);
                  dragWholeBlock(event, blocks.current.get(chapter.id));
                  setDrag({ kind: "chapter", id: chapter.id });
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOverChapter(null);
                }}
                aria-hidden
                title="Drag to reorder this chapter"
                className="cursor-grab px-1 text-[13px] text-ink-muted active:cursor-grabbing"
              >
                ⠿
              </span>

              <button
                type="button"
                onClick={() => toggle(chapter.id)}
                aria-label={collapsed.has(chapter.id) ? "Expand" : "Collapse"}
                className="grid size-5 place-items-center rounded text-[10px] text-ink-muted hover:text-ink"
              >
                {collapsed.has(chapter.id) ? "▸" : "▾"}
              </button>

              <input
                value={chapter.title}
                onChange={(event) => onRenameChapter(chapter.id, event.target.value)}
                aria-label={`Chapter ${chapterIndex + 1} name`}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-bold outline-none hover:border-subtle focus:border-accent focus:bg-surface"
              />

              <button
                type="button"
                onClick={() => setAdding(chapter.id)}
                aria-label={`Add a lesson to ${chapter.title}`}
                title="Add a lesson"
                className="grid size-6 place-items-center rounded-md border border-subtle text-[13px] font-bold text-ink-secondary transition-colors hover:border-strong hover:text-ink"
              >
                +
              </button>

              <button
                type="button"
                onClick={() => {
                  const count = chapter.lessons.length;
                  const warning = count
                    ? `Delete "${chapter.title}" and its ${count} ${count === 1 ? "lesson" : "lessons"}? Everyone's progress on them goes too.`
                    : `Delete "${chapter.title}"?`;
                  if (confirm(warning)) onDeleteChapter(chapter.id);
                }}
                aria-label={`Delete ${chapter.title}`}
                title="Delete this chapter"
                className="grid size-6 place-items-center rounded-md border border-subtle text-[12px] text-ink-muted transition-colors hover:border-critical hover:text-critical"
              >
                🗑
              </button>
            </header>

            {!collapsed.has(chapter.id) && (
              <ul className="space-y-1 px-2 pb-2">
                {chapter.lessons.map((lesson, lessonIndex) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    selected={lesson.id === selectedId}
                    dragging={drag?.kind === "lesson" && drag.id === lesson.id}
                    basePath={basePath}
                    onSelect={() => onSelect(lesson.id)}
                    onDelete={() => {
                      if (confirm(`Delete "${lesson.title}"? This cannot be undone.`)) {
                        onDeleteLesson(lesson.id);
                      }
                    }}
                    onDragStart={() => setDrag({ kind: "lesson", id: lesson.id })}
                    onDragEnd={() => {
                      setDrag(null);
                      setOverChapter(null);
                    }}
                    onDropHere={(event) => {
                      if (drag?.kind !== "lesson") return;
                      event.preventDefault();
                      event.stopPropagation();
                      onMoveLesson(drag.id, chapter.id, lessonIndex);
                      setDrag(null);
                      setOverChapter(null);
                    }}
                  />
                ))}

                {chapter.lessons.length === 0 && (
                  <li className="rounded-lg border border-dashed border-subtle px-3 py-4 text-center text-[12px] text-ink-muted">
                    Nothing here yet
                  </li>
                )}
              </ul>
            )}
          </section>
        ))}

        <button
          type="button"
          onClick={onAddChapter}
          disabled={busy}
          className={`${BTN} mt-1 w-full`}
        >
          + Add chapter
        </button>
      </div>

      {adding && (
        <NewLessonDialog
          onClose={() => setAdding(null)}
          onCreate={(kind) => {
            onAddLesson(adding, kind);
            setAdding(null);
          }}
        />
      )}
    </aside>
  );
}

function LessonRow({
  lesson,
  selected,
  dragging,
  basePath,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  onDropHere,
}: {
  lesson: LessonNode;
  selected: boolean;
  dragging: boolean;
  basePath: string;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropHere: (event: React.DragEvent) => void;
}) {
  const [over, setOver] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const length = formatLessonLength(lesson.durationSeconds);

  return (
    <li
      ref={row}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        onDropHere(event);
      }}
      className={`flex items-center gap-2 rounded-lg border px-1.5 py-1.5 transition-colors ${
        selected ? "border-accent-edge bg-accent-soft" : "border-transparent hover:bg-page"
      } ${over ? "border-accent" : ""} ${dragging ? "opacity-40" : ""}`}
    >
      <span
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", lesson.id);
          dragWholeBlock(event, row.current);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        aria-hidden
        title="Drag into another chapter, or up and down"
        className="cursor-grab text-[13px] text-ink-muted active:cursor-grabbing"
      >
        ⠿
      </span>

      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <LessonThumb lesson={lesson} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-ink">
            {lesson.title}
          </span>
          <span className="block text-[11px] text-ink-muted">
            {lessonKindLabel(lesson.kind)}
            {length ? ` • ${length}` : ""}
          </span>
        </span>
      </button>

      <Menu label={`Options for ${lesson.title}`}>
        {(close) => (
          <>
            <MenuItem
              icon="🔗"
              onClick={() => {
                void copyLink(`${basePath}/${lesson.id}`);
                close();
              }}
            >
              Copy link
            </MenuItem>
            <MenuItem
              icon="🗑"
              tone="danger"
              onClick={() => {
                close();
                onDelete();
              }}
            >
              Delete lesson
            </MenuItem>
          </>
        )}
      </Menu>
    </li>
  );
}

/* --------------------------------------------------------------- the new lesson -- */

/**
 * What kind of lesson this is going to be, asked once at creation.
 *
 * Quizzes are deliberately not on this list. The kind can be changed afterwards from
 * the lesson itself, so choosing here is not a decision anyone is stuck with.
 */
function NewLessonDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (kind: LessonKind) => void;
}) {
  const [kind, setKind] = useState<LessonKind>("MULTIMEDIA");

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
      aria-label="New lesson"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-strong bg-surface p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[16px]">New lesson</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-lg border border-subtle text-ink-secondary hover:border-strong hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {LESSON_KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                kind === option.value
                  ? "border-accent bg-accent-soft"
                  : "border-subtle hover:border-strong"
              }`}
            >
              <span aria-hidden className="mt-0.5 text-[15px]">
                {option.value === "PDF" ? "📄" : "🎬"}
              </span>
              <span>
                <span className="block text-[13px] font-bold text-ink">
                  {option.label}
                </span>
                <span className="block text-[12px] text-ink-secondary">
                  {option.note}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={() => onCreate(kind)} className={BTN_PRIMARY}>
            Create lesson
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ links -- */

/**
 * Puts a lesson's own URL on the clipboard.
 *
 * Absolute, because the point of it is pasting somewhere that is not this app. The
 * older `execCommand` path is there for a browser that refuses the clipboard API
 * outside a secure context — which includes a plain-http staging box.
 */
export async function copyLink(path: string) {
  const url = new URL(path, window.location.origin).toString();
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = url;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  }
}
