import { HubNav } from "@/components/HubNav";
import { requireHub, spansHubs, touchLastSeen } from "@/lib/access";
import { prisma } from "@/lib/db";
import { tabsFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * Everything inside one offer.
 *
 * The guard is here rather than repeated on each page, and every action underneath
 * calls its own — a form post does not go through a layout.
 *
 * The switcher's list of other hubs is only fetched for somebody who works across
 * them. A student's page must not carry the names of offers they cannot reach, even
 * in a dropdown they never open.
 */
export default async function HubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { actor, hub } = await requireHub(slug);
  await touchLastSeen(actor);

  const others = spansHubs(actor)
    ? await prisma.hub.findMany({
        orderBy: { position: "asc" },
        select: { name: true, slug: true, status: true },
      })
    : [];

  return (
    <>
      <HubNav actor={actor} hub={hub} others={others} tabs={tabsFor(actor.role, slug)} />
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </>
  );
}
