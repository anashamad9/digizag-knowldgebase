import { z } from "zod";
import { cookies } from "next/headers";
import { context, failure, check, ApiError, sameOrigin } from "@/lib/api";
import {
  composio,
  composioUser,
  authConfig,
  revokeConnection,
} from "@/lib/composio";
import { adminDb } from "@/lib/supabase/server";
export async function GET() {
  try {
    const { db } = await context();
    const { data, error } = await db
      .from("connections")
      .select("id,provider,status,last_synced_at,error,visibility");
    check(error);
    return Response.json({ connections: data });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user, workspaceId } = await context();
    const { provider, visibility } = z
      .object({
        provider: z.enum(["gmail", "pumble"]),
        visibility: z.enum(["private", "workspace"]).default("private"),
      })
      .parse(await request.json());
    const state = crypto.randomUUID();
    const jar = await cookies();
    jar.set(
      "brain-connect",
      JSON.stringify({ state, provider, visibility, userId: user.id }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 900,
        path: "/api/connections/callback",
      },
    );
    const origin = process.env.APP_URL;
    if (!origin)
      throw new ApiError("Set APP_URL to your application URL.", 503);
    const configId = await authConfig(provider);
    let link;
    try {
      link = await composio().connectedAccounts.link(
        composioUser(workspaceId, user.id),
        configId,
        { callbackUrl: `${origin}/api/connections/callback?state=${state}` },
      );
    } catch {
      throw new ApiError(
        "Composio could not start this connection. Check the auth configuration and callback URL.",
        502,
      );
    }
    return Response.json({ url: link.redirectUrl });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await context();
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const { data, error } = await db
      .from("connections")
      .select("composio_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (error || !data) throw new ApiError("Connection not found.", 404);
    const admin = adminDb();
    const { error: pauseError } = await admin
      .from("connections")
      .update({ status: "DISCONNECTING" })
      .eq("id", id);
    check(pauseError);
    await revokeConnection(data.composio_id);
    const { error: de } = await admin
      .from("connections")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);
    check(de);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
