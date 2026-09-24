import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { context, check } from "@/lib/api";
import { composio, composioUser, authConfig } from "@/lib/composio";
import { adminDb } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const { user, workspaceId } = await context();
    const jar = await cookies();
    const pending = z
      .object({
        state: z.string(),
        provider: z.enum(["gmail", "pumble"]),
        visibility: z.enum(["private", "workspace"]),
        userId: z.string(),
      })
      .parse(JSON.parse(jar.get("brain-connect")?.value ?? "{}"));
    if (
      pending.state !== url.searchParams.get("state") ||
      pending.userId !== user.id ||
      url.searchParams.get("status") !== "success"
    )
      throw new Error("Invalid connection callback");
    const id = url.searchParams.get("connected_account_id");
    if (!id) throw new Error("Missing account");
    const account = await composio().connectedAccounts.get(id);
    const listed = await composio().connectedAccounts.list({
      userIds: [composioUser(workspaceId, user.id)],
      authConfigIds: [await authConfig(pending.provider)],
      statuses: ["ACTIVE"],
    });
    if (
      !listed.items.some((a) => a.id === id) ||
      account.toolkit.slug !== pending.provider ||
      account.status !== "ACTIVE"
    )
      throw new Error("Account ownership check failed");
    const { error } = await adminDb().from("connections").upsert(
      {
        owner_id: user.id,
        workspace_id: workspaceId,
        provider: pending.provider,
        composio_id: id,
        status: "ACTIVE",
        visibility: pending.visibility,
        cursor: {},
        last_synced_at: null,
        error: null,
      },
      { onConflict: "owner_id,provider" },
    );
    check(error);
    jar.delete("brain-connect");
    return NextResponse.redirect(
      new URL("/?page=apps&connected=1", process.env.APP_URL || url.origin),
    );
  } catch {
    return NextResponse.redirect(
      new URL(
        "/?page=apps&connection_error=1",
        process.env.APP_URL || url.origin,
      ),
    );
  }
}
