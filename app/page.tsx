import { configured, serverDb } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Brain from "@/components/brain";
import { AccessState } from "@/components/access-state";
import { avatarUrl } from "@/lib/avatar";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured())
    return (
      <AccessState message="Connect Supabase to start. Follow the setup instructions in README.md." />
    );
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: member, error } = await db
    .from("members")
    .select("workspace_id,role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error)
    return (
      <AccessState
        signOut
        message={
          error.code === "PGRST205"
            ? `Brain’s tables are unavailable in Supabase project ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}. Check that the URL and API keys match the project where you ran setup.sql.`
            : `Could not read workspace membership (${error.code || "connection error"}). Check database permissions and availability.`
        }
      />
    );
  if (!member)
    return (
      <AccessState
        signOut
        message="Your account has no workspace access. Ask your administrator to add you."
      />
    );
  const email = user.email ?? "";
  const name = String(
    user.user_metadata.full_name ||
      user.user_metadata.name ||
      email.split("@")[0] ||
      "Account",
  );
  return (
    <Brain
      email={email}
      name={name}
      userId={user.id}
      isOwner={member.role === "owner"}
      avatarUrl={avatarUrl(user.id, user.user_metadata)}
    />
  );
}
