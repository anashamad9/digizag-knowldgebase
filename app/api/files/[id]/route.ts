import { z } from "zod";
import { context, failure, ApiError } from "@/lib/api";
import { adminDb } from "@/lib/supabase/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await context();
    const { id } = await params;
    z.uuid().parse(id);
    const { data, error } = await db
      .from("memories")
      .select("id,owner_id,metadata")
      .eq("id", id)
      .single();
    if (error || !data?.metadata?.storage_path)
      throw new ApiError("File is no longer available.", 404);
    const path = data.metadata.storage_path;
    if (
      typeof path !== "string" ||
      !path.startsWith(`${data.owner_id}/${data.id}/`)
    )
      throw new ApiError("Invalid file reference.", 403);
    const file = await adminDb()
      .storage.from("knowledge")
      .createSignedUrl(path, 60, {
        download: String(data.metadata.filename || "download"),
      });
    if (file.error || !file.data)
      throw new ApiError("File download failed.", 502);
    return Response.redirect(file.data.signedUrl);
  } catch (e) {
    return failure(e);
  }
}
