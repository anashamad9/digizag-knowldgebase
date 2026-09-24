import { toFile } from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ai } from "./memory";
import { check } from "./api";
import type { Memory } from "./types";
export async function prepareChatFiles(
  db: SupabaseClient,
  conversationId: string,
  uploadedIds: string[],
) {
  const result = await db
    .from("memories")
    .select("id,title,content,source,created_at,visibility,metadata,owner_id")
    .eq("conversation_id", conversationId)
    .eq("source", "file")
    .order("created_at", { ascending: false })
    .limit(5);
  check(result.error);
  const files = (result.data || []) as Memory[];
  for (const file of files) {
    const filename = String(file.metadata.filename || file.title);
    if (
      !/\.(csv|tsv|xlsx|xls|pdf|docx|txt|md|json|xml|html|py|js|zip|png|jpg|jpeg|gif|webp)$/i.test(
        filename,
      )
    )
      continue;
    const path = file.metadata.storage_path;
    if (
      typeof path !== "string" ||
      !path.startsWith(`${file.owner_id}/${file.id}/`)
    )
      continue;
    const stored = await db.storage.from("knowledge").download(path);
    check(stored.error);
    if (!stored.data) continue;
    const upload = await ai().files.create({
      file: await toFile(await stored.data.arrayBuffer(), filename),
      purpose: "user_data",
      expires_after: { anchor: "created_at", seconds: 3600 },
    });
    uploadedIds.push(upload.id);
  }
  return files.map((f) => ({ ...f, content: f.content.slice(0, 18000) }));
}
