import { z } from "zod";
import { context, failure, ApiError, check, sameOrigin } from "@/lib/api";
import { adminDb } from "@/lib/supabase/server";
import { revokeConnection } from "@/lib/composio";
import { cleanDeletedFiles } from "@/lib/storage-cleanup";
import { avatarUrl } from "@/lib/avatar";
async function owner() {
  const c = await context();
  if (c.role !== "owner")
    throw new ApiError("Only the workspace owner can manage users.", 403);
  return { ...c, admin: adminDb() };
}
async function target(id: string, workspaceId: string, allowOwnerEdit = false) {
  const { data, error } = await adminDb()
    .from("members")
    .select("user_id,role")
    .eq("user_id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data)
    throw new ApiError("User not found in this workspace.", 404);
  if (data.role === "owner" && !allowOwnerEdit)
    throw new ApiError("The owner account cannot be changed here.", 403);
  return data;
}
export async function GET(request: Request) {
  try {
    const { admin, workspaceId } = await owner();
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .parse(new URL(request.url).searchParams.get("page") || 1);
    const { data, error, count } = await admin
      .from("members")
      .select("user_id,role,disabled", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("user_id")
      .range((page - 1) * 50, page * 50 - 1);
    check(error);
    const users = await Promise.all(
      (data || []).map(async (m) => {
        const { data, error } = await admin.auth.admin.getUserById(m.user_id);
        check(error);
        const u = data.user!;
        return {
          id: u.id,
          email: u.email,
          name: u.user_metadata.full_name || u.user_metadata.name || "",
          role: m.role,
          disabled: m.disabled,
          last_login: u.last_sign_in_at,
          created_at: u.created_at,
          avatar_url: avatarUrl(u.id, u.user_metadata),
        };
      }),
    );
    return Response.json({ users, total: count || 0, page });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { admin, workspaceId } = await owner();
    const body = z
      .object({
        email: z.email(),
        name: z.string().trim().min(1).max(100),
        password: z.string().min(12).max(128),
      })
      .parse(await request.json());
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.name },
    });
    if (error)
      throw new ApiError(
        error.code === "email_exists"
          ? "This email already has an account. Add existing accounts through the membership SQL."
          : "Could not create the account. Check email and password requirements.",
      );
    const result = await admin.from("members").insert({
      user_id: data.user.id,
      workspace_id: workspaceId,
      role: "member",
    });
    if (result.error) {
      await admin.auth.admin.deleteUser(data.user.id);
      check(result.error);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { admin, workspaceId } = await owner();
    const body = z
      .object({
        id: z.uuid(),
        email: z.email().optional(),
        name: z.string().trim().min(1).max(100).optional(),
        password: z.string().min(12).max(128).optional(),
        disabled: z.boolean().optional(),
      })
      .parse(await request.json());
    await target(body.id, workspaceId, body.disabled === undefined);
    if (body.email || body.name || body.password) {
      const old = await admin.auth.admin.getUserById(body.id);
      check(old.error);
      const update = await admin.auth.admin.updateUserById(body.id, {
        ...(body.email ? { email: body.email, email_confirm: true } : {}),
        ...(body.password ? { password: body.password } : {}),
        ...(body.name
          ? {
              user_metadata: {
                ...old.data.user?.user_metadata,
                full_name: body.name,
              },
            }
          : {}),
      });
      if (update.error)
        throw new ApiError(
          "Could not update the account. Check the email and password requirements.",
        );
    }
    if (body.disabled !== undefined) {
      check(
        (
          await admin
            .from("members")
            .update({ disabled: body.disabled })
            .eq("user_id", body.id)
            .eq("workspace_id", workspaceId)
        ).error,
      );
      check(
        (
          await admin
            .from("connections")
            .update({ status: body.disabled ? "SUSPENDED" : "ACTIVE" })
            .eq("owner_id", body.id)
            .eq("workspace_id", workspaceId)
            .eq("status", body.disabled ? "ACTIVE" : "SUSPENDED")
        ).error,
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { admin, workspaceId } = await owner();
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    await target(id, workspaceId);
    const account = await admin.auth.admin.getUserById(id);
    check(account.error);
    // Revoke app access first; retries remain possible through the owner endpoint.
    check(
      (
        await admin
          .from("members")
          .update({ disabled: true })
          .eq("user_id", id)
          .eq("workspace_id", workspaceId)
      ).error,
    );
    const connections = await admin
      .from("connections")
      .select("id,composio_id")
      .eq("owner_id", id)
      .eq("workspace_id", workspaceId);
    check(connections.error);
    for (const c of connections.data || []) {
      check(
        (
          await admin
            .from("connections")
            .update({ status: "DISCONNECTING" })
            .eq("id", c.id)
        ).error,
      );
      try {
        await revokeConnection(c.composio_id);
      } catch {
        throw new ApiError(
          "Access is suspended. Disconnect this user's app accounts before retrying deletion.",
          502,
        );
      }
    }
    check(
      (
        await admin
          .from("connections")
          .delete()
          .eq("owner_id", id)
          .eq("workspace_id", workspaceId)
      ).error,
    );
    check(
      (
        await admin
          .from("conversations")
          .delete()
          .eq("owner_id", id)
          .eq("workspace_id", workspaceId)
      ).error,
    );
    check(
      (
        await admin
          .from("memories")
          .delete()
          .eq("owner_id", id)
          .eq("workspace_id", workspaceId)
      ).error,
    );
    await cleanDeletedFiles(id);
    const avatarPath = account.data.user?.user_metadata.avatar_path;
    if (
      typeof avatarPath === "string" &&
      avatarPath.startsWith(`${id}/profile/`)
    )
      check((await admin.storage.from("knowledge").remove([avatarPath])).error);
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error)
      throw new ApiError(
        "Access is suspended and Brain data removed. Account deletion could not finish; retry after checking Supabase dependencies.",
        502,
      );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
