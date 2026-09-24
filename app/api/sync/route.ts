import { z } from "zod";
import { context, failure, ApiError, sameOrigin } from "@/lib/api";
import { syncConnection } from "@/lib/sync";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await context();
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const { data } = await db
      .from("connections")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (!data) throw new ApiError("Connection not found.", 404);
    return Response.json(await syncConnection(id));
  } catch (e) {
    return failure(e);
  }
}
