import { redirect } from "next/navigation";

import { needsSetup } from "@/lib/access";

import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

/**
 * First run only. Once an owner exists this route is closed, so there is never a
 * public page that mints an account.
 */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return <SetupForm />;
}
