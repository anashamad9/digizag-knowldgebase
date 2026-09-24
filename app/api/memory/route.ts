import { z } from "zod";
import type { Memory } from "@/lib/types";
import { context, failure, check, sameOrigin, ApiError } from "@/lib/api";
import { adminDb } from "@/lib/supabase/server";
import { cleanDeletedFiles } from "@/lib/storage-cleanup";
import { ingest } from "@/lib/memory";
export const maxDuration = 180;
export async function GET(request: Request) {
  try {
    const { db, user } = await context();
    const requestedId = new URL(request.url).searchParams.get("id");
    if (requestedId) {
      z.uuid().parse(requestedId);
      const { data: memory, error } = await db
        .from("memories")
        .select(
          "id,title,content,source,created_at,visibility,metadata,owner_id",
        )
        .eq("id", requestedId)
        .single();
      if (error || !memory)
        throw new ApiError("This source is no longer available to you.", 404);
      if (memory.owner_id === user.id) {
        const revisions = await db
          .from("memory_revisions")
          .select("id,title,content,replaced_at")
          .eq("memory_id", requestedId)
          .order("replaced_at", { ascending: false })
          .limit(10);
        // Allow existing workspaces to read sources while the additive migration is pending.
        if (revisions.error && revisions.error.code !== "PGRST205")
          check(revisions.error);
        return Response.json({
          memory: { ...memory, revisions: revisions.data ?? [] },
        });
      }
      return Response.json({ memory });
    }
    const { data: memoryRows, error } = await db
      .rpc("list_memories_by_date")
      .select(
        "id,title,content,source,created_at,visibility,metadata,owner_id",
      );
    if (error?.code === "PGRST202")
      throw new ApiError(
        "Run 005_memory_order.sql in Supabase to enable sent-date sorting.",
        503,
      );
    check(error);
    if (!Array.isArray(memoryRows))
      throw new ApiError("Unexpected memory list response.", 502);
    const memories: Memory[] = memoryRows;
    if (new URL(request.url).searchParams.get("only") === "memories")
      return Response.json({ memories });
    const { data: conversations, error: ce } = await db
      .from("conversations")
      .select(
        "id,title,updated_at,messages(id,role,content,source_ids,saved,visibility,created_at)",
      )
      .order("updated_at", { ascending: false })
      .limit(50);
    check(ce);
    const sourceIds = [
      ...new Set(
        (conversations ?? []).flatMap((c) =>
          c.messages.flatMap((m) => m.source_ids as string[]),
        ),
      ),
    ];
    const sourceMap = new Map((memories ?? []).map((m) => [m.id, m]));
    if (sourceIds.length) {
      const { data: references, error: re } = await db
        .from("memories")
        .select(
          "id,title,content,source,created_at,visibility,metadata,owner_id",
        )
        .in("id", sourceIds);
      check(re);
      references?.forEach((m) => sourceMap.set(m.id, m));
    }
    return Response.json({
      memories,
      conversations: conversations?.map((c) => ({
        ...c,
        messages: c.messages
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((m) => ({
            ...m,
            sources: m.source_ids
              .map((id: string) => sourceMap.get(id))
              .filter(Boolean),
          })),
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const { db, user, workspaceId } = await context();
    const body = z
      .object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().min(1),
        visibility: z.enum(["private", "workspace"]),
      })
      .parse(await request.json());
    const { data: old, error } = await db
      .from("memories")
      .select("*")
      .eq("id", body.id)
      .eq("owner_id", user.id)
      .single();
    if (error || !old)
      throw new ApiError(
        "Only the person who added this memory can edit it.",
        403,
      );
    if (old.source !== "gmail" && old.source !== "pumble")
      z.string().max(120000).parse(body.content);
    await ingest(db, {
      ...old,
      ...body,
      workspace_id: workspaceId,
      owner_id: user.id,
      metadata: {
        ...old.metadata,
        edited_at: new Date().toISOString(),
        user_edited: true,
      },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await context();
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const { data: old, error: readError } = await db
      .from("memories")
      .select("metadata,connection_id,external_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (readError || !old)
      throw new ApiError(
        "Only the person who added this memory can remove it.",
        403,
      );
    if (old.connection_id && old.external_id) {
      const { error: ignoreError } = await adminDb()
        .from("ignored_sources")
        .upsert({
          connection_id: old.connection_id,
          external_id: old.external_id,
        });
      check(ignoreError);
    }
    const { error } = await db
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);
    check(error);
    let cleanupPending = false;
    try {
      await cleanDeletedFiles(user.id);
    } catch {
      cleanupPending = true;
    }
    return Response.json({ ok: true, cleanupPending });
  } catch (e) {
    return failure(e);
  }
}
