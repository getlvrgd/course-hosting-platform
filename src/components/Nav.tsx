import Link from "next/link";

import { logout } from "@/app/actions/auth";
import { roleLabel } from "@/lib/options";

import { Logo } from "./Logo";
import { PresenceBeacon } from "./PresenceBeacon";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The bar across the top of every signed-in page.
 *
 * A student's version has one tab and no sign of the admin side — not a greyed-out
 * link, not a locked one. Hiding it is a courtesy rather than the control (that is
 * src/lib/access.ts), but a nav that advertises rooms you cannot enter is its own kind
 * of unfinished.
 */
export function Nav({
  actor,
  tabs,
  current,
}: {
  actor: { name: string; role: string };
  tabs: { href: string; label: string }[];
  /** The href whose tab is lit — matched by prefix, so a nested page keeps its tab. */
  current: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-page/90 backdrop-blur">
      {/* Every signed-in page renders this nav, so this is the one place the
          heartbeat has to be mounted. */}
      <PresenceBeacon />
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href={tabs[0]?.href ?? "/"} className="shrink-0">
          <Logo height={20} />
        </Link>

        <nav className="scroll-x flex min-w-0 flex-1 items-center gap-1">
          {tabs.map((tab) => {
            const active =
              current === tab.href ||
              (tab.href !== "/" && current.startsWith(`${tab.href}/`));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  active
                    ? "bg-accent-soft text-ink"
                    : "text-ink-secondary hover:bg-surface hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Your name is the way to your own account — the same place a desktop app
              puts it, and the only route the owner has to their own password. */}
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
