import { adminDb } from "./supabase/server";
import { check } from "./api";
export async function cleanDeletedFiles(ownerId?: string) {
  const db = adminDb();
  let query = db
    .from("storage_deletions")
    .select("path")
    .order("created_at")
    .limit(100);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  check(error);
  if (!data?.length) return;
  const paths = data.map((x) => x.path);
  const result = await db.storage.from("knowledge").remove(paths);
  check(result.error);
  check((await db.from("storage_deletions").delete().in("path", paths)).error);
}
