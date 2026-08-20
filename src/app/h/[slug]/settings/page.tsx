import { DownloadCodes } from "@/components/DownloadCodes";
import { DownloadLog } from "@/components/DownloadLog";
import { DownloadSettings } from "@/components/DownloadSettings";
import { HubSettings } from "@/components/HubSettings";
import { TeamSection } from "@/components/TeamSection";
import { requireHubAdmin } from "@/lib/access";
import { isOwner } from "@/lib/auth";
import { readAt } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/options";
import { DOWNLOAD_MODES, readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * One offer's settings, and everything about who is taking copies of it.
 *
 * Per hub rather than app-wide: one offer being a paid course whose videos need
 * protecting says nothing about another that is free, and the owner runs both.
 *
 * The codes and the log only appear when downloads are gated. An empty code table
 * under a setting that ignores codes would suggest they were doing something.
 */
export default async function HubSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { actor, hub } = await requireHubAdmin(slug);
  const now = readAt();
  const settings = readSettings(hub.settings);

  const [team, codes, attempts] = await Promise.all([
    prisma.user.findMany({
      // Admins of this offer. The owner is not on this list — they are not a member of
      // one offer, and there is nothing here that could be done to them anyway.
      where: { hubId: hub.id, role: ROLES.ADMIN },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        lastSeenAt: true,
      },
    }),
    prisma.downloadCode.findMany({
      where: { hubId: hub.id },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        label: true,
        hint: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    prisma.downloadAttempt.findMany({
      where: { hubId: hub.id },
      orderBy: { at: "desc" },
      take: 50,
      select: {
        id: true,
        userName: true,
        userEmail: true,
        lessonTitle: true,
        courseTitle: true,
        outcome: true,
        at: true,
        code: { select: { label: true } },
      },
    }),
  ]);

  const gated = settings.downloads === DOWNLOAD_MODES.CODE;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-[26px]">Settings</h1>
      <p className="mt-1 text-[13px] text-ink-secondary">
        These apply to <span className="font-semibold text-ink">{hub.name}</span> and
        nothing else. Your other offers keep their own.
      </p>

      <div className="mt-6 space-y-4">
        <HubSettings hub={hub} canDelete={isOwner(actor)} />

        <TeamSection
          team={team}
          slug={slug}
          hubName={hub.name}
          now={now}
          isOwner={isOwner(actor)}
          selfId={actor.userId}
        />

        <DownloadSettings mode={settings.downloads} slug={slug} />

        {gated && <DownloadCodes codes={codes} now={now} slug={slug} />}

        {/* The log stays even after downloads are turned off again — what happened
            while they were open is exactly what someone would come here to check. */}
        {(gated || attempts.length > 0) && (
          <DownloadLog attempts={attempts} now={now} />
        )}
      </div>
    </div>
  );
}
