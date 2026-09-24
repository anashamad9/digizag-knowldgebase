import { configured, serverDb } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LoginForm from "@/components/login-form";
import { AccessState } from "@/components/access-state";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (!configured())
    return (
      <AccessState message="Connect Supabase to start. Follow the setup instructions in README.md." />
    );
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (user) redirect("/");
  return <LoginForm />;
}
