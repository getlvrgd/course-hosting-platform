import Link from "next/link";

import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { homePathFor, requireActor } from "@/lib/access";
import { roleLabel } from "@/lib/options";

export const dynamic = "force-dynamic";

/**
 * Your own account, whoever you are.
 *
 * It sits outside every hub — an owner has several, a student has one, and the page is
 * the same for both — so it carries its own bar rather than a hub's tabs. The way back
 * goes wherever that person belongs.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  const back = await homePathFor(actor);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-subtle bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href={back} className="shrink-0">
            <Logo height={20} />
          </Link>
          <Link
            href={back}
            className="mr-auto text-[13px] font-semibold text-ink-secondary hover:text-ink"
          >
            ← Back
          </Link>

          <span className="hidden text-right text-[12px] leading-tight sm:block">
            <span className="block font-semibold text-ink">{actor.name}</span>
            <span className="block text-ink-muted">{roleLabel(actor.role)}</span>
          </span>
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </>
  );
}
