import { redirect } from "next/navigation";

import { homePathFor, needsSetup } from "@/lib/access";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The domain root. Nobody sees a page here — it decides where you belong and sends you
 * there, so the URL you hand a student is just the domain.
 */
export default async function RootPage() {
  if (await needsSetup()) redirect("/setup");

  const session = await getSession();
  if (!session) redirect("/login");

  redirect(await homePathFor(session));
}
