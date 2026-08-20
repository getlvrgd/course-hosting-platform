import { CourseTile } from "@/components/CourseTile";
import { Empty, ProgressBar } from "@/components/ui";
import { requireHub } from "@/lib/access";
import { isAdmin } from "@/lib/auth";
import { listCourses } from "@/lib/catalog";
import { percent } from "@/lib/course";

export const dynamic = "force-dynamic";

/**
 * The grid: every course this person can open, with how far into each one they are.
 *
 * An admin sees the hidden ones too, marked as such. They are the person who hid them,
 * and checking the student view without publishing first is the point of the state.
 */
export default async function HubHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { actor, hub } = await requireHub(slug);
  const courses = await listCourses(actor, hub.id);

  const lessons = courses.reduce((sum, course) => sum + course.lessons, 0);
  const completed = courses.reduce((sum, course) => sum + course.completed, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px]">{hub.name}</h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            Work through them in any order. Your progress saves itself.
          </p>
        </div>

        {lessons > 0 && (
          <div className="w-full max-w-64">
            <p className="mb-1.5 text-[12px] font-semibold text-ink-secondary">
              Everything, together
            </p>
            <ProgressBar
              value={percent(completed, lessons)}
              accent="violet"
              label={`${completed} of ${lessons} lessons`}
            />
          </div>
        )}
      </div>

      <div className="mt-6">
        {courses.length === 0 ? (
          <Empty title="No courses yet">
            {isAdmin(actor)
              ? "Add one from the Courses tab and publish it when it's ready."
              : "Nothing has been published to you yet. Check back shortly."}
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseTile
                key={course.id}
                course={course}
                href={`/h/${slug}/c/${course.slug}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
