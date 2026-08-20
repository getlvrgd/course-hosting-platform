import { HubDirectory } from "@/components/HubDirectory";
import { Empty } from "@/components/ui";
import { requireGlobal } from "@/lib/access";
import { isOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STATUS } from "@/lib/options";

export const dynamic = "force-dynamic";

/**
 * Every offer you run.
 *
 * Only the owner and a cross-offer admin ever see this. A student, and an admin bound
 * to one offer, are sent straight into the one hub they belong to and never learn the
 * directory exists.
 */
export default async function DirectoryPage() {
  const actor = await requireGlobal();

  const rows = await prisma.hub.findMany({
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      thumbnailUrl: true,
      accent: true,
      status: true,
      courses: {
        select: { chapters: { select: { _count: { select: { lessons: true } } } } },
      },
      _count: { select: { users: true } },
    },
  });

  const hubs = rows.map((hub) => ({
    id: hub.id,
    name: hub.name,
    slug: hub.slug,
    description: hub.description,
    thumbnailUrl: hub.thumbnailUrl,
    accent: hub.accent,
    status: hub.status,
    courses: hub.courses.length,
    lessons: hub.courses.reduce(
      (sum, course) =>
        sum + course.chapters.reduce((inner, ch) => inner + ch._count.lessons, 0),
      0,
    ),
    students: hub._count.users,
  }));

  const live = hubs.filter((hub) => hub.status === STATUS.LIVE).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px]">Offers</h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {hubs.length} {hubs.length === 1 ? "offer" : "offers"} · {live} open to
            students. Each one has its own courses, students and logins.
          </p>
        </div>
        {hubs.length > 0 && (
          <p className="text-[12px] text-ink-muted">
            Drag a tile by its <span aria-hidden>⠿</span> handle to change the order.
          </p>
        )}
      </div>

      <div className="mt-6">
        {hubs.length === 0 && !isOwner(actor) ? (
          <Empty title="No offers yet">
            The owner hasn&apos;t set one up. Once they do, it appears here.
          </Empty>
        ) : (
          <HubDirectory hubs={hubs} canCreate={isOwner(actor)} />
        )}
      </div>
    </div>
  );
}
