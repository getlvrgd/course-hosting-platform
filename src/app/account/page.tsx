import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Avatar } from "@/components/ui";
import { requireActor } from "@/lib/access";
import { roleLabel } from "@/lib/options";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await requireActor();

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={actor.name} color="violet" size={40} />
        <div className="min-w-0">
          <h1 className="truncate text-[24px]">{actor.name}</h1>
          <p className="text-[13px] text-ink-secondary">
            {actor.email} · {roleLabel(actor.role)}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
