import { cleanDeletedFiles } from "@/lib/storage-cleanup";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/supabase/server";
import { syncConnection } from "@/lib/sync";
import { check, failure } from "@/lib/api";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json({ error: "Cron is not configured." }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await cleanDeletedFiles();
    const { data, error } = await adminDb()
      .from("connections")
      .select("id")
      .eq("status", "ACTIVE")
      .order("last_attempt_at", { ascending: true, nullsFirst: true })
      .limit(2);
    check(error);
    const results = [];
    for (const c of data ?? []) {
      try {
        results.push({ id: c.id, ...(await syncConnection(c.id)) });
      } catch {
        results.push({ id: c.id, error: "Sync needs attention" });
      }
    }
    return Response.json({ results });
  } catch (e) {
    return failure(e);
  }
}
