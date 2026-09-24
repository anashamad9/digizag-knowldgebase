import { z } from "zod";
import { context, failure, ApiError, check, sameOrigin } from "@/lib/api";
import { adminDb } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/avatar";

const status = z.enum(["pending", "on_it", "done", "issue"]);
const priority = z.enum(["low", "medium", "high", "urgent"]);
const fields = {
  title: z.string().trim().min(1).max(160),
  details: z.string().trim().max(5000),
  assignee_id: z.uuid(),
  priority,
  deadline: z.iso.date().nullable(),
  status,
};

async function requireAssignee(userId: string, workspaceId: string) {
  const { data, error } = await adminDb()
    .from("members")
    .select("user_id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("disabled", false)
    .maybeSingle();
  check(error);
  if (!data)
    throw new ApiError("Choose an active user from this workspace.", 400);
}

export async function GET() {
  try {
    const { workspaceId } = await context();
    const admin = adminDb();
    const members = await admin
      .from("members")
      .select("user_id,role")
      .eq("workspace_id", workspaceId)
      .eq("disabled", false)
      .order("role");
    check(members.error);
    const users = await Promise.all(
      (members.data || []).map(async (member) => {
        const result = await admin.auth.admin.getUserById(member.user_id);
        check(result.error);
        const account = result.data.user!;
        return {
          id: account.id,
          email: account.email || "",
          name:
            account.user_metadata.full_name ||
            account.user_metadata.name ||
            account.email?.split("@")[0] ||
            "User",
          avatar_url: avatarUrl(account.id, account.user_metadata),
        };
      }),
    );
    const tasks = await admin
      .from("tasks")
      .select(
        "id,title,details,assignee_id,creator_id,priority,deadline,status,created_at,updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    check(tasks.error);
    return Response.json({ tasks: tasks.data || [], users });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { workspaceId, user } = await context();
    const body = z.object(fields).parse(await request.json());
    await requireAssignee(body.assignee_id, workspaceId);
    const result = await adminDb()
      .from("tasks")
      .insert({
        ...body,
        workspace_id: workspaceId,
        creator_id: user.id,
      })
      .select(
        "id,title,details,assignee_id,creator_id,priority,deadline,status,created_at,updated_at",
      )
      .single();
    check(result.error);
    return Response.json({ task: result.data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { workspaceId } = await context();
    const body = z
      .object({ id: z.uuid(), ...fields })
      .partial()
      .required({ id: true })
      .parse(await request.json());
    if (body.assignee_id) await requireAssignee(body.assignee_id, workspaceId);
    const { id, ...changes } = body;
    if (!Object.keys(changes).length)
      throw new ApiError("No task changes were provided.");
    const result = await adminDb()
      .from("tasks")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select(
        "id,title,details,assignee_id,creator_id,priority,deadline,status,created_at,updated_at",
      )
      .maybeSingle();
    check(result.error);
    if (!result.data) throw new ApiError("Task not found.", 404);
    return Response.json({ task: result.data });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { workspaceId } = await context();
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const result = await adminDb()
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id")
      .maybeSingle();
    check(result.error);
    if (!result.data) throw new ApiError("Task not found.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
