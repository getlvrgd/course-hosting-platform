import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { requireActor } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Signed in, but with nowhere to go: their offer is not open yet, has been retired, or
 * they have not been put on one.
 *
 * A page rather than a redirect loop, and deliberately vague about which of those it
 * is — an account has no business learning the state of an offer it cannot reach.
 */
export default async function NoHubPage() {
  const actor = await requireActor();

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Logo height={26} />
        <h1 className="mt-4 text-[24px]">Nothing here yet</h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          You&apos;re signed in as {actor.email}, but there&apos;s no course library open
          to you at the moment. Whoever invited you will be able to sort that out.
        </p>
        <form action={logout} className="mt-5">
          <button
            type="submit"
            className="rounded-full border border-subtle px-3 py-1.5 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-strong hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
