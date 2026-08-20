import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PresenceBeacon } from "@/components/PresenceBeacon";
import Link from "next/link";

import { requireGlobal } from "@/lib/access";
import { roleLabel } from "@/lib/options";

export const dynamic = "force-dynamic";

/**
 * The directory sits above every hub, so it has its own bar rather than the hub nav —
 * there is no offer to be inside of here, and no tabs that would mean anything.
 */
export default async function DirectoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireGlobal();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-subtle bg-page/90 backdrop-blur">
        <PresenceBeacon />
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/hub" className="shrink-0">
            <Logo height={20} />
          </Link>
          <span className="mr-auto text-[13px] font-semibold text-ink-secondary">
            Your offers
          </span>

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
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </>
  );
}
