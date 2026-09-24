import { context, failure, ApiError, check, sameOrigin } from "@/lib/api";
import { extractFile } from "@/lib/file-extraction";
import { ingest } from "@/lib/memory";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user, workspaceId } = await context();
    const { data: allowed, error: rateError } = await adminDb().rpc(
      "consume_request",
      { uid: user.id },
    );
    check(rateError);
    if (!allowed)
      throw new ApiError(
        "Please wait a minute before uploading more files.",
        429,
      );
    if (Number(request.headers.get("content-length")) > 4_200_000)
      throw new ApiError("Maximum file size is 4 MB.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Choose a file to upload.");
    if (file.size > 4_000_000)
      throw new ApiError("Maximum file size is 4 MB.", 413);
    const visibility = z
      .enum(["private", "workspace"])
      .parse(form.get("visibility") ?? "private");
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, indexed } = await extractFile(buffer, file.name, file.type);
    const conversationId = form.get("conversationId");
    if (conversationId) {
      z.uuid().parse(conversationId);
      const existing = await db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();
      check(existing.error);
      if (!existing.data)
        check(
          (
            await db.from("conversations").insert({
              id: conversationId,
              workspace_id: workspaceId,
              owner_id: user.id,
              title: file.name.slice(0, 70),
            })
          ).error,
        );
    }
    const id = crypto.randomUUID();
    const storagePath = `${user.id}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await db.storage
      .from("knowledge")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
      });
    check(error);
    try {
      await ingest(db, {
        id,
        workspace_id: workspaceId,
        owner_id: user.id,
        title: String(form.get("path") || file.name).slice(0, 200),
        content: text,
        source: "file",
        visibility,
        metadata: {
          filename: file.name,
          indexed,
          mime: file.type,
          ...(conversationId ? { conversation_id: conversationId } : {}),
          path: String(form.get("path") || file.name),
          size: file.size,
          author: user.email,
          storage_path: storagePath,
        },
      });
    } catch (e) {
      await db.storage.from("knowledge").remove([storagePath]);
      throw e;
    }
    return Response.json({ id, indexed });
  } catch (e) {
    return failure(e);
  }
}
