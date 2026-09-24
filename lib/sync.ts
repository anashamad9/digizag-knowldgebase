import { z } from "zod";
import {
  skipChannel,
  channelAccessWarning,
  type SkippedChannel,
} from "./sync-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "./supabase/server";
import { ApiError, check } from "./api";
import { composio, proxyRead, UpstreamError } from "./composio";
import { hash, ingest } from "./memory";
import {
  normalizeGmail,
  normalizePumble,
  pumblePage,
  type GmailMessage,
  type PumbleMessage,
} from "./normalize";
type Task = {
  channelId: string;
  channelName: string;
  root?: string;
  cursor?: string;
  lastPage?: string;
};
type Cursor = {
  phase?: "full" | "history";
  pageToken?: string;
  historyId?: string;
  pending?: string[];
  tasks?: Task[];
  pumblePending?: { message: PumbleMessage; channelName: string }[];
  users?: Record<string, string>;
  skippedChannels?: SkippedChannel[];
};
type SyncConnection = {
  id: string;
  workspace_id: string;
  owner_id: string;
  composio_id: string;
  provider: "gmail" | "pumble";
  visibility: "private" | "workspace";
  cursor: Cursor;
  status: string;
};
export async function syncConnection(id: string) {
  const db = adminDb();
  const { data: c, error } = await db
    .from("connections")
    .select("*")
    .eq("id", id)
    .single();
  check(error);
  if (!c || c.status !== "ACTIVE")
    throw new ApiError("Reconnect this account before syncing.", 409);
  const member = await db
    .from("members")
    .select("disabled")
    .eq("user_id", c.owner_id)
    .eq("workspace_id", c.workspace_id)
    .maybeSingle();
  check(member.error);
  if (!member.data || member.data.disabled)
    throw new ApiError("Account access is suspended.", 403);
  const { data: claimed, error: claimError } = await db.rpc(
    "claim_connection",
    { connection_uuid: id },
  );
  check(claimError);
  if (!claimed)
    throw new ApiError(
      "This account is already syncing. Try again shortly.",
      409,
    );
  const connection = c as SyncConnection;
  const { error: attemptError } = await db
    .from("connections")
    .update({ last_attempt_at: new Date().toISOString() })
    .eq("id", id);
  check(attemptError);
  try {
    const account = await composio().connectedAccounts.get(
      connection.composio_id,
    );
    if (account.status !== "ACTIVE" || account.isDisabled) {
      const { error } = await db
        .from("connections")
        .update({ status: account.status })
        .eq("id", id);
      check(error);
      throw new ApiError(
        "Your account connection expired. Reconnect it in Apps.",
        409,
      );
    }
    const result =
      connection.provider === "gmail"
        ? await syncGmail(db, connection)
        : await syncPumble(db, connection);
    const warning = channelAccessWarning(connection.cursor.skippedChannels);
    const { error } = await db
      .from("connections")
      .update({
        cursor: connection.cursor,
        last_synced_at: new Date().toISOString(),
        error: warning,
      })
      .eq("id", id);
    check(error);
    return { ...result, warning };
  } catch (e) {
    await db
      .from("connections")
      .update({
        error:
          e instanceof ApiError
            ? e.message
            : "Sync failed. Verify app access and retry.",
      })
      .eq("id", id);
    throw e;
  } finally {
    await db.from("connections").update({ locked_until: null }).eq("id", id);
  }
}
async function checkpoint(db: SupabaseClient, c: SyncConnection) {
  const { error } = await db
    .from("connections")
    .update({ cursor: c.cursor })
    .eq("id", c.id);
  check(error);
}
async function remove(
  db: SupabaseClient,
  c: SyncConnection,
  externalId: string,
) {
  const { error } = await db
    .from("memories")
    .delete()
    .eq("connection_id", c.id)
    .eq("external_id", externalId);
  check(error);
}
async function store(
  db: SupabaseClient,
  c: SyncConnection,
  externalId: string,
  item: { title: string; content: string; metadata: Record<string, unknown> },
) {
  const { data: ignored, error: ignoredError } = await db
    .from("ignored_sources")
    .select("external_id")
    .eq("connection_id", c.id)
    .eq("external_id", externalId)
    .maybeSingle();
  check(ignoredError);
  if (ignored) return false;
  const { data: old, error } = await db
    .from("memories")
    .select("id,content_hash,metadata")
    .eq("connection_id", c.id)
    .eq("external_id", externalId)
    .maybeSingle();
  check(error);
  if (old?.metadata?.user_edited) return false;
  if (old?.content_hash === hash(item.content)) {
    const { error } = await db
      .from("memories")
      .update({ metadata: item.metadata })
      .eq("id", old.id);
    check(error);
    return false;
  }
  await ingest(db, {
    ...item,
    id: old?.id,
    workspace_id: c.workspace_id,
    owner_id: c.owner_id,
    connection_id: c.id,
    external_id: externalId,
    source: c.provider,
    visibility: c.visibility,
  });
  return true;
}
async function syncGmail(db: SupabaseClient, c: SyncConnection) {
  const cursor = c.cursor;
  let count = 0;
  const start = Date.now();
  if (!cursor.phase) {
    const profile = await proxyRead<{ historyId: string }>(
      c.composio_id,
      "gmail",
      "/profile",
    );
    cursor.phase = "full";
    cursor.historyId = z.string().parse(profile.historyId);
    await checkpoint(db, c);
  }
  if (!cursor.pending?.length) {
    if (cursor.phase === "full") {
      const page = await proxyRead<{
        messages?: { id: string }[];
        nextPageToken?: string;
      }>(c.composio_id, "gmail", "/messages", {
        maxResults: 15,
        includeSpamTrash: "true",
        ...(cursor.pageToken ? { pageToken: cursor.pageToken } : {}),
      });
      cursor.pending = (page.messages ?? []).map((m) => z.string().parse(m.id));
      cursor.pageToken = page.nextPageToken;
      if (!page.nextPageToken) cursor.phase = "history";
    } else {
      try {
        const page = await proxyRead<{
          history?: {
            messages?: { id: string }[];
            messagesDeleted?: { message: { id: string } }[];
          }[];
          nextPageToken?: string;
          historyId: string;
        }>(c.composio_id, "gmail", "/history", {
          startHistoryId: cursor.historyId!,
          maxResults: 15,
          ...(cursor.pageToken ? { pageToken: cursor.pageToken } : {}),
        });
        const ids = new Set<string>();
        for (const event of page.history ?? []) {
          for (const m of event.messages ?? []) ids.add(m.id);
          for (const m of event.messagesDeleted ?? []) {
            await remove(db, c, m.message.id);
            ids.delete(m.message.id);
          }
        }
        cursor.pending = [...ids];
        cursor.pageToken = page.nextPageToken;
        if (!page.nextPageToken) cursor.historyId = page.historyId;
      } catch (e) {
        if (e instanceof UpstreamError && e.status === 404) {
          c.cursor = {};
          await checkpoint(db, c);
          return { count: 0, more: true };
        }
        throw e;
      }
    }
    await checkpoint(db, c);
  }
  while (cursor.pending?.length && count < 15 && Date.now() - start < 115000) {
    const id = cursor.pending[0];
    try {
      const message = await proxyRead<GmailMessage>(
        c.composio_id,
        "gmail",
        `/messages/${encodeURIComponent(id)}`,
        { format: "full" },
      );
      await store(db, c, id, normalizeGmail(message));
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 404)
        await remove(db, c, id);
      else throw e;
    }
    cursor.pending.shift();
    count++;
    await checkpoint(db, c);
  }
  return {
    count,
    more:
      !!cursor.pending?.length || !!cursor.pageToken || cursor.phase === "full",
  };
}
async function syncPumble(db: SupabaseClient, c: SyncConnection) {
  const cursor = c.cursor;
  let count = 0;
  const start = Date.now();
  if (!cursor.tasks?.length && !cursor.pumblePending?.length) {
    const channelRows = z
      .array(
        z.object({
          channel: z.object({
            id: z.string(),
            name: z.string(),
            channelType: z.string().optional(),
          }),
        }),
      )
      .parse(await proxyRead(c.composio_id, "pumble", "/listChannels"));
    const users = z
      .array(z.object({ id: z.string(), name: z.string() }))
      .parse(await proxyRead(c.composio_id, "pumble", "/listUsers"));
    cursor.skippedChannels = [];
    cursor.users = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const channels = channelRows
      .map((row) => row.channel)
      .filter(
        (ch) => ch.channelType !== "DIRECT" && ch.channelType !== "GROUP",
      );
    cursor.tasks = channels.map((ch) => ({
      channelId: ch.id,
      channelName: ch.name,
    }));
    // Drop previously imported channels that this account can no longer access.
    const accessible = new Set(channels.map((ch) => ch.id));
    let offset = 0;
    while (true) {
      const { data: existing, error } = await db
        .from("memories")
        .select("id,metadata")
        .eq("connection_id", c.id)
        .range(offset, offset + 499);
      check(error);
      const removed = (existing ?? [])
        .filter((m) => !accessible.has(m.metadata.channel_id))
        .map((m) => m.id);
      if (removed.length) {
        const { error } = await db.from("memories").delete().in("id", removed);
        check(error);
      }
      if (!existing || existing.length < 500) break;
      offset += existing.length - removed.length;
    }
    await checkpoint(db, c);
  }
  if (!cursor.pumblePending?.length && cursor.tasks?.length) {
    const task = cursor.tasks[0];
    const params: Record<string, string | number> = {
      channelId: task.channelId,
      limit: 15,
      ...(task.cursor ? { cursor: task.cursor, strategy: "BEFORE" } : {}),
    };
    if (task.root) params.rootMessageId = task.root;
    let page: ReturnType<typeof pumblePage>;
    try {
      page = pumblePage(
        await proxyRead(
          c.composio_id,
          "pumble",
          task.root ? "/fetchThreadReplies" : "/listMessages",
          params,
        ),
      );
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 403) {
        const next = skipChannel(
          cursor.tasks,
          cursor.skippedChannels ?? [],
          task,
        );
        cursor.tasks = next.tasks;
        cursor.skippedChannels = next.skippedChannels;
        await checkpoint(db, c);
        return { count: 0, more: cursor.tasks.length > 0 };
      }
      throw error;
    }
    const fingerprint = hash(page.messages.map((m) => m.id).join(","));
    if (task.lastPage === fingerprint && page.messages.length)
      throw new ApiError(
        "Pumble pagination did not advance. Verify cursor support for this account before continuing sync.",
        502,
      );
    cursor.pumblePending = page.messages.map((message) => ({
      message,
      channelName: task.channelName,
    }));
    const roots = !task.root
      ? page.messages.filter((m) => m.threadRootInfo && !m.deleted)
      : [];
    const hasMore = page.hasMore ?? page.messages.length === 15;
    if (hasMore && page.messages.length) {
      const oldest = [...page.messages].sort(
        (a, b) =>
          (a.timestampMilli ?? new Date(a.timestamp ?? 0).getTime()) -
          (b.timestampMilli ?? new Date(b.timestamp ?? 0).getTime()),
      )[0];
      const next = String(oldest.timestampMilli ?? oldest.timestamp ?? "");
      if (!next || next === task.cursor)
        throw new ApiError(
          "Pumble returned an invalid pagination cursor.",
          502,
        );
      task.cursor = next;
      task.lastPage = fingerprint;
    } else cursor.tasks.shift();
    cursor.tasks.push(
      ...roots.map((m) => ({
        channelId: task.channelId,
        channelName: task.channelName,
        root: m.id,
      })),
    );
    await checkpoint(db, c);
  }
  while (
    cursor.pumblePending?.length &&
    count < 15 &&
    Date.now() - start < 115000
  ) {
    const { message, channelName } = cursor.pumblePending[0];
    if (message.deleted) await remove(db, c, message.id);
    else
      await store(
        db,
        c,
        message.id,
        normalizePumble(message, channelName, cursor.users ?? {}),
      );
    cursor.pumblePending.shift();
    count++;
    await checkpoint(db, c);
  }
  return {
    count,
    more: !!cursor.pumblePending?.length || !!cursor.tasks?.length,
  };
}
