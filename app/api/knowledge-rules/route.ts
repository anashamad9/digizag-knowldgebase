import { z } from "zod";
import { context, failure, check, sameOrigin, ApiError } from "@/lib/api";
export async function GET() {
  try {
    const { db, workspaceId } = await context();
    const { data, error } = await db
      .from("knowledge_rules")
      .select("content,updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error?.code === "PGRST205")
      throw new ApiError("Run 004_knowledge.sql in Supabase first.", 503);
    check(error);
    return Response.json({
      content: data?.content ?? "",
      updated_at: data?.updated_at ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    const { db, workspaceId, role } = await context();
    if (role !== "owner")
      throw new ApiError("Only the owner can edit business rules.", 403);
    const { content } = z
      .object({ content: z.string().trim().max(12000) })
      .parse(await request.json());
    const { error } = await db
      .from("knowledge_rules")
      .upsert({
        workspace_id: workspaceId,
        content,
        updated_at: new Date().toISOString(),
      });
    check(error);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
