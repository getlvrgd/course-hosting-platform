import Link from "next/link";

import { Empty, ProgressLine } from "@/components/ui";
import { requireHubAdmin } from "@/lib/access";
import { progressBoard } from "@/lib/catalog";
import { tintVars } from "@/lib/options";

export const dynamic = "force-dynamic";

/**
 * Everyone against every published course, as one grid.
 *
 * The whole point is reading down a column as much as across a row: a course where
 * every cell is low is a course with a problem, and that is not visible from any one
 * student's page.
 *
 * A cell is a small bar rather than a number alone, so the shape of a row is legible
 * at a glance — and the number is written beside it, because a bar cannot be read to
 * the percent.
 */
export default async function ProgressPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { hub } = await requireHubAdmin(slug);
  const { courses, students } = await progressBoard(hub.id);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="text-[26px]">Progress</h1>
      <p className="mt-1 text-[13px] text-ink-secondary">
        Published courses only — a course still being built would drag everyone&apos;s
        figure down the moment you added a chapter to it.
      </p>

      <div className="mt-6">
        {students.length === 0 || courses.length === 0 ? (
          <Empty title="Nothing to compare yet">
            {courses.length === 0
              ? "Publish a course and this fills in."
              : "Add a student and their progress appears here."}
          </Empty>
        ) : (
          <div className="scroll-x rounded-2xl border border-subtle bg-surface px-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] font-bold tracking-widest text-ink-muted uppercase">
                  <th className="sticky left-0 z-10 bg-surface py-2.5 pr-3 font-bold">
                    Student
                  </th>
                  <th className="px-3 py-2.5 font-bold">Overall</th>
                  {courses.map((course) => {
                    const tint = tintVars(course.accent);
                    return (
                      <th
                        key={course.id}
                        className="min-w-36 px-3 py-2.5 font-bold normal-case"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-sm"
                            style={{ background: tint?.outline ?? "var(--accent)" }}
                          />
                          <span className="truncate text-[12px] tracking-normal text-ink-secondary">
                            {course.title}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className={`border-t border-subtle ${student.isActive ? "" : "opacity-55"}`}
                  >
                    <td className="sticky left-0 z-10 bg-surface py-2.5 pr-3">
                      <Link
                        href={`/h/${slug}/students/${student.id}`}
                        className="block max-w-48 truncate text-[13px] font-bold text-ink hover:text-accent"
                      >
                        {student.name}
                      </Link>
                      <span className="block max-w-48 truncate text-[12px] text-ink-muted">
                        {student.email}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <ProgressLine value={student.percent} accent="violet" />
                    </td>

                    {courses.map((course) => (
                      <td key={course.id} className="px-3 py-2.5">
                        <ProgressLine
                          value={student.byCourse[course.id] ?? 0}
                          accent={course.accent}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
