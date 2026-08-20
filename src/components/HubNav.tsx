import Link from "next/link";

import { logout } from "@/app/actions/auth";
import { roleLabel } from "@/lib/options";

import { HubSwitcher } from "./HubSwitcher";
import { Logo } from "./Logo";
import { PresenceBeacon } from "./PresenceBeacon";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The bar inside an offer: which offer you are in, and the tabs of it.
 *
 * A student's version has one tab, no switcher and no sign of the directory — not a
 * greyed-out link, not a locked one. Hiding it is a courtesy rather than the control
 * (that is src/lib/access.ts), but a nav that advertises rooms you cannot enter is its
 * own kind of unfinished.
 */
export function HubNav({
  actor,
  hub,
  others,
  tabs,
}: {
  actor: { name: string; role: string };
  hub: { name: string; slug: string; status: string };
  /** Empty for anyone who does not work across offers. */
  others: { name: string; slug: string; status: string }[];
  tabs: { href: string; label: string }[];
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-page/90 backdrop-blur">
      {/* Every signed-in page renders a nav, so this is the one place the heartbeat
          has to be mounted. */}
      <PresenceBeacon />

      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:px-6">
        <Link href={tabs[0]?.href ?? `/h/${hub.slug}`} className="shrink-0">
          <Logo height={20} />
        </Link>

        {others.length > 0 ? (
          <HubSwitcher hub={hub} others={others} />
        ) : (
          <span className="max-w-40 truncate text-[13px] font-bold text-ink">
            {hub.name}
          </span>
        )}

        <nav className="scroll-x flex min-w-0 flex-1 items-center gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-secondary transition-colors hover:bg-surface hover:text-ink"
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/account"
            title="Your account"
            className="hidden rounded-lg px-1.5 py-0.5 text-right text-[12px] leading-tight transition-colors hover:bg-surface sm:block"
          >
            <span className="block font-semibold text-ink">{actor.name}</span>
            <span className="block text-ink-muted">{roleLabel(actor.role)}</span>
          </Link>
          <ThemeToggle />
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-secondary transition-colors hover:border-strong hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
