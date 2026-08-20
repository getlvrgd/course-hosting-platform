import Link from "next/link";
import { notFound } from "next/navigation";

import { LessonPlayer } from "@/components/LessonPlayer";
import { StudentOutline } from "@/components/StudentOutline";
import { ProgressBar } from "@/components/ui";
import { requireHub } from "@/lib/access";
import { loadCourseForStudent } from "@/lib/catalog";
import { forPlayer } from "@/lib/course";
import { DOWNLOAD_MODES, isProtected, readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * One lesson, with the contents beside it.
 *
 * The whole course is loaded rather than the single lesson, because the sidebar has to
 * show where this one sits and what is done either side of it — and because Previous
 * and Next need the flattened order anyway. It is one query for the tree and one for
 * the progress, which is cheaper than it sounds and much simpler than stitching a
 * partial together.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; courseSlug: string; lessonId: string }>;
}) {
  const { slug, courseSlug, lessonId } = await params;
  const { actor, hub } = await requireHub(slug);
  const { tree, progress, percent, lessons, completed } = await loadCourseForStudent(
    courseSlug,
    hub.id,
    actor,
  );
  const { downloads } = readSettings(hub.settings);
  const base = `/h/${slug}/c/${tree.slug}`;

  const flat = tree.chapters.flatMap((chapter) => chapter.lessons);
  const index = flat.findIndex((lesson) => lesson.id === lessonId);
  // A lesson id from another course, or one that has been deleted since the link was
  // sent — same answer either way.
  if (index === -1) notFound();

  const lesson = flat[index];
  const chapter = tree.chapters.find((row) =>
    row.lessons.some((item) => item.id === lesson.id),
  );

  // Drip is enforced here, not only hidden in the sidebar: someone with the URL of a
  // lesson that has not opened yet gets the same answer as someone clicking a padlock.
  const opens = progress.locked.get(lesson.id) ?? null;

  const previous = index > 0 ? flat[index - 1] : null;
  const next = index < flat.length - 1 ? flat[index + 1] : null;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <Link
          href={base}
          className="text-[13px] font-semibold text-ink-secondary hover:text-ink"
        >
          ← {tree.title}
        </Link>

        <p className="mt-3 text-[11px] font-bold tracking-widest text-ink-muted uppercase">
          {chapter?.title}
        </p>
        <h1 className="mt-0.5 text-[26px]">{lesson.title}</h1>

        <div className="mt-4">
          {opens ? (
            <div className="grid aspect-video w-full place-items-center rounded-2xl border border-dashed border-subtle bg-surface px-6 text-center">
              <div>
                <p aria-hidden className="text-[22px]">
                  🔒
                </p>
                <p className="mt-1 text-[14px] font-bold text-ink">
                  This lesson opens {opens.toLocaleDateString()}
                </p>
                <p className="mt-1 text-[12px] text-ink-secondary">
                  It unlocks {lesson.dripDays} days after you joined. Everything else in
                  the course is open now.
                </p>
              </div>
            </div>
          ) : (
            <LessonPlayer
              // Swapped here, on the server: with protection on, the storage URL never
              // reaches the browser at all rather than merely being hidden from it.
              lesson={forPlayer(lesson)}
              complete={progress.done.has(lesson.id)}
              resumeAt={progress.watched.get(lesson.id) ?? 0}
              protect={isProtected(downloads)}
              askForCode={downloads === DOWNLOAD_MODES.CODE}
            />
          )}
        </div>

        <nav className="mt-8 flex items-center justify-between gap-3 border-t border-subtle pt-4">
          {previous ? (
            <Link
              href={`${base}/${previous.id}`}
              className="min-w-0 text-[13px] font-semibold text-ink-secondary hover:text-ink"
            >
              ← <span className="truncate">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`${base}/${next.id}`}
              className="min-w-0 text-right text-[13px] font-semibold text-ink-secondary hover:text-ink"
            >
              <span className="truncate">{next.title}</span> →
            </Link>
          )}
        </nav>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-subtle bg-surface p-4">
          <ProgressBar
            value={percent}
            accent={tree.accent}
            label={`${completed} of ${lessons} lessons`}
          />
          <div className="mt-4">
            <StudentOutline
              chapters={tree.chapters}
              basePath={base}
              done={progress.done}
              locked={progress.locked}
              currentId={lesson.id}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
