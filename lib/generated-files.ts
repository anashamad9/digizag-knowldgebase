import type { SupabaseClient } from "@supabase/supabase-js";
import { ai, ingest } from "./memory";
import { check } from "./api";
import { extractFile } from "./file-extraction";
import type { Memory } from "./types";
// Containers are fresh per request and are discovered only from server-side model events.
export async function saveGeneratedFiles(
  db: SupabaseClient,
  containers: Set<string>,
  ownerId: string,
  workspaceId: string,
  conversationId: string,
) {
  const files: Memory[] = [];
  try {
    for (const container of containers) {
      for await (const file of ai().containers.files.list(container)) {
        if (
          file.source !== "assistant" ||
          !file.path.includes("/brain-output/")
        )
          continue;
        if (files.length >= 5 || file.bytes > 4_000_000)
          throw new Error(
            "Generated files exceed the five-file or 4 MB limit.",
          );
        const response = await ai().containers.files.content.retrieve(file.id, {
          container_id: container,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 4_000_000)
          throw new Error("Generated file exceeds 4 MB.");
        const filename = file.path.split("/").pop() || "download";
        const id = crypto.randomUUID();
        const storage_path = `${ownerId}/${id}/${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { text, indexed } = await extractFile(buffer, filename);
        const metadata = {
          filename,
          storage_path,
          indexed,
          generated: true,
          conversation_id: conversationId,
          size: buffer.length,
        };
        check(
          (
            await db.storage.from("knowledge").upload(storage_path, buffer, {
              contentType: "application/octet-stream",
            })
          ).error,
        );
        try {
          await ingest(db, {
            id,
            workspace_id: workspaceId,
            owner_id: ownerId,
            title: filename,
            content: text,
            source: "file",
            visibility: "private",
            metadata,
          });
        } catch (e) {
          await db.storage.from("knowledge").remove([storage_path]);
          throw e;
        }
        files.push({
          id,
          title: filename,
          content: text,
          source: "file",
          visibility: "private",
          created_at: new Date().toISOString(),
          metadata,
          owner_id: ownerId,
        });
      }
    }
    return files;
  } finally {
    // Do not retain a second, untracked copy of generated business documents.
    await Promise.allSettled(
      [...containers].map((id) => ai().containers.delete(id)),
    );
    containers.clear();
  }
}
