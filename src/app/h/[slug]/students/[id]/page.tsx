import Link from "next/link";

import { AutoRefresh } from "@/components/AutoRefresh";
import { PresenceDot } from "@/components/PresenceDot";
import { Ago, Avatar, Empty, ProgressBar, ProgressLine } from "@/components/ui";
import { requireHubAdmin } from "@/lib/access";
import { readAt, studentDetail } from "@/lib/catalog";
import { roleLabel } from "@/lib/options";
import { HEARTBEAT_MS } from "@/lib/presence";

export const dynamic = "force-dynamic";

/**
 * One person, course by course.
 *
 * The headline figure counts published courses only — the same rule as the roster — so
 * the number here and the number on the students tab are the same number. The hidden
 * ones are still listed underneath, marked, because an admin previewing a draft should
 * be able to see that they did.
 */
export default async function StudentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { hub } = await requireHubAdmin(slug);
  const { user, courses, percent, completed, lessons } = await studentDetail(id, hub.id);
  // One clock read for the whole page — see readAt.
  const now = readAt();

  const started = courses.filter((course) => course.completed > 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link
        href={`/h/${slug}/students`}
        className="text-[13px] font-semibold text-ink-secondary hover:text-ink"
      >
        ← Students
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Avatar name={user.name} color="blue" size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px]">{user.name}</h1>
          <p className="text-[13px] text-ink-secondary">
            {user.email} · {roleLabel(user.role)}
            {!user.isActive && " · deactivated"}
          </p>
        </div>

        <PresenceDot
          lastSeenAt={user.lastSeenAt ? user.lastSeenAt.toISOString() : null}
          lastActiveAt={user.lastActiveAt ? user.lastActiveAt.toISOString() : null}
          disabled={!user.isActive}
        />
      </div>

      <AutoRefresh everyMs={HEARTBEAT_MS} />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-subtle bg-surface p-4">
          <p className="text-[11px] font-bold tracking-widest text-ink-muted uppercase">
            Across the library
          </p>
          <div className="mt-2">
            <ProgressBar
              value={percent}
              accent="blue"
              label={`${completed} of ${lessons} lessons`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface p-4">
          <p className="text-[11px] font-bold tracking-widest text-ink-muted uppercase">
            Courses started
          </p>
          <p className="tabular mt-1 text-[26px] font-extrabold tracking-[-0.08em]">
            {started.length}
          </p>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface p-4">
          <p className="text-[11px] font-bold tracking-widest text-ink-muted uppercase">
            Joined · last here
          </p>
          <p className="mt-1 text-[13px] text-ink-secondary">
            <Ago date={user.createdAt} now={now} /> · <Ago date={user.lastSeenAt} now={now} />
          </p>
        </div>
      </div>

      <h2 className="mt-7 text-[16px]">Course by course</h2>

      <div className="mt-3">
        {courses.length === 0 ? (
          <Empty title="No courses yet">
            Once a course exists, their progress on it appears here.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {courses.map((course) => (
              <li
                key={course.courseId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-ink">
                    {course.title}
                    {course.visibility !== "PUBLISHED" && (
                      <span className="ml-2 text-[11px] font-semibold text-ink-muted">
                        hidden
                      </span>
                    )}
                  </p>
                  <p className="tabular text-[12px] text-ink-muted">
                    {course.completed} of {course.lessons} lessons
                    {course.lastActivity && (
                      <>
                        {" · last "}
                        <Ago date={course.lastActivity} now={now} />
                      </>
                    )}
                  </p>
                </div>
                <ProgressLine value={course.percent} accent={course.accent} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
