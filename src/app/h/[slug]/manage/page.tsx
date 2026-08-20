import { AdminCourseGrid, GridHint } from "@/components/AdminCourseGrid";
import { requireHubAdmin } from "@/lib/access";
import { isOwner } from "@/lib/auth";
import { listCoursesForAdmin } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/** Every course there is, published or not, in the order they appear to students. */
export default async function ManageCoursesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { actor, hub } = await requireHubAdmin(slug);
  const courses = await listCoursesForAdmin(hub.id);

  const published = courses.filter((course) => course.visibility === "PUBLISHED").length;
  const lessons = courses.reduce((sum, course) => sum + course.lessons, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px]">Courses</h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {courses.length} {courses.length === 1 ? "course" : "courses"} · {published}{" "}
            published · {lessons} {lessons === 1 ? "lesson" : "lessons"}
          </p>
        </div>
        <GridHint count={courses.length} slug={slug} />
      </div>

      <div className="mt-6">
        <AdminCourseGrid
          courses={courses}
          hubId={hub.id}
          slug={slug}
          canDelete={isOwner(actor)}
        />
      </div>
    </div>
  );
}
