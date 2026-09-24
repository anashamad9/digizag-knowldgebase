import { z } from "zod";
import { after } from "next/server";
import { context, failure, sameOrigin, check } from "@/lib/api";
import { cleanDeletedFiles } from "@/lib/storage-cleanup";
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await context();
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    check(
      (
        await db
          .from("conversations")
          .delete()
          .eq("id", id)
          .eq("owner_id", user.id)
      ).error,
    );
    // The database cascade has already removed the chat and its searchable
    // memories and queued file paths durably. Storage latency must not hold
    // the delete response open; cron retries any paths left in the queue.
    after(async () => {
      try {
        await cleanDeletedFiles(user.id);
      } catch {
        console.error("Chat file cleanup deferred to the retry queue.");
      }
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
