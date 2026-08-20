import { AddStudentForm } from "@/components/AddStudentForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StudentRow } from "@/components/StudentRow";
import { Empty, ProgressBar } from "@/components/ui";
import { requireHubAdmin } from "@/lib/access";
import { isOwner } from "@/lib/auth";
import { readAt, roster } from "@/lib/catalog";
import { percent } from "@/lib/course";
import { ROLES } from "@/lib/options";
import { HEARTBEAT_MS, presenceOf } from "@/lib/presence";

export const dynamic = "force-dynamic";

/**
 * Who is in here, and how far each of them has got.
 *
 * One table rather than a students list and a separate admins list: they are the same
 * roster, and splitting it would mean the owner has to look in two places to answer
 * "who has an account". The role column carries the difference.
 */
export default async function StudentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { actor, hub } = await requireHubAdmin(slug);
  const people = await roster(hub.id);
  // One clock read for the whole page — see readAt.
  const now = readAt();

  const students = people.filter((person) => person.role === ROLES.STUDENT);
  const active = students.filter((person) => person.isActive).length;
  // Counted the same way the dots are, so the headline and the rows never disagree.
  const here = people.filter(
    (person) =>
      person.isActive &&
      presenceOf(person.lastSeenAt, person.lastActiveAt, now) !== "offline",
  ).length;
  const completed = students.reduce((sum, person) => sum + person.completed, 0);
  const possible = students.reduce((sum, person) => sum + person.lessons, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px]">Students</h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {students.length} {students.length === 1 ? "student" : "students"} ·{" "}
            {active} with access · {people.length - students.length} on the admin side
            {here > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-ink">{here} here now</span>
              </>
            )}
          </p>
        </div>

        {students.length > 0 && (
          <div className="w-full max-w-64">
            <p className="mb-1.5 text-[12px] font-semibold text-ink-secondary">
              Everyone, together
            </p>
            <ProgressBar value={percent(completed, possible)} accent="blue" />
          </div>
        )}
      </div>

      {/* Presence decays in the browser on its own; this is what notices someone
          arriving. Paused while the tab is in the background. */}
      <AutoRefresh everyMs={HEARTBEAT_MS} />

      <div className="mt-5">
        <AddStudentForm slug={slug} />
      </div>

      <div className="mt-5">
        {people.length === 0 ? (
          <Empty title="Nobody here yet">
            Add someone above. They sign in at this same address with the password you
            give them.
          </Empty>
        ) : (
          <div className="scroll-x rounded-2xl border border-subtle bg-surface px-4">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="text-left text-[11px] font-bold tracking-widest text-ink-muted uppercase">
                  <th className="py-2.5 pr-3 font-bold">Person</th>
                  <th className="px-3 py-2.5 font-bold">Account</th>
                  <th className="px-3 py-2.5 font-bold">Progress</th>
                  <th className="px-3 py-2.5 font-bold">Presence</th>
                  <th className="py-2.5 pl-3" />
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <StudentRow
                    key={person.id}
                    person={person}
                    isSelf={person.id === actor.userId}
                    // The owner's row, and your own, are not managed from here.
                    canManage={
                      person.role !== ROLES.OWNER &&
                      person.id !== actor.userId &&
                      (isOwner(actor) || person.role === ROLES.STUDENT)
                    }
                    canPromote={isOwner(actor)}
                    now={now}
                    slug={slug}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
