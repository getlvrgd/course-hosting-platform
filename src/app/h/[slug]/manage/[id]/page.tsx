import Link from "next/link";

import { deleteCourse } from "@/app/actions/courses";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CourseEditor } from "@/components/CourseEditor";
import { CourseSettings } from "@/components/CourseSettings";
import { INPUT, VisibilityPill } from "@/components/ui";
import { requireHubAdmin } from "@/lib/access";
import { isOwner } from "@/lib/auth";
import { loadTree } from "@/lib/catalog";
import { courseSummary } from "@/lib/course";
import { blobConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * One course, open for building: its settings folded above, its outline and lessons
 * below.
 *
 * `blobConfigured` is read here and handed down because it decides how the browser
 * uploads — straight to blob storage, or to this app's own disk. The editor cannot ask
 * that question itself: the token is a server secret, and the whole point is that it
 * never reaches the page.
 */
export default async function CourseEditorPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { actor, hub } = await requireHubAdmin(slug);
  const tree = await loadTree(id, hub.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-subtle px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/h/${slug}/manage`}
              className="text-[13px] font-semibold text-ink-secondary hover:text-ink"
            >
              ← Courses
            </Link>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[18px]">{tree.title}</h1>
              <p className="text-[12px] text-ink-muted">
                {courseSummary(tree)} · /h/{slug}/c/{tree.slug}
              </p>
            </div>

            <VisibilityPill visibility={tree.visibility} />
            <CopyLinkButton path={`/h/${slug}/c/${tree.slug}`} label="Copy student link" />
            <CourseSettings course={tree} />
          </div>
        </div>
      </div>

      <CourseEditor
        initial={tree}
        hubId={hub.id}
        basePath={`/h/${slug}/c/${tree.slug}`}
        blob={blobConfigured()}
      />

      {isOwner(actor) && (
        <section
          id="danger"
          className="border-t border-subtle px-4 py-6 sm:px-6"
        >
          <div className="mx-auto w-full max-w-7xl">
            <h2 className="text-[14px]">Delete this course</h2>
            <p className="mt-1 max-w-xl text-[12px] text-ink-secondary">
              Removes the course, its chapters, its lessons, and everyone&apos;s
              progress on them. Uploaded videos stay in storage. Type{" "}
              <span className="font-bold text-ink">{tree.title}</span> to confirm.
            </p>
            <form action={deleteCourse} className="mt-2 flex max-w-md items-center gap-2">
              <input type="hidden" name="courseId" value={tree.id} />
              <input
                name="confirm"
                aria-label="Type the course name to confirm"
                placeholder={tree.title}
                className={INPUT}
              />
              <button
                type="submit"
                className="shrink-0 rounded-full border border-subtle px-3 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-critical hover:text-critical"
              >
                Delete
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
