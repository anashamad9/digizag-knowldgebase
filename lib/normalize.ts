import { z } from "zod";
import { messageDate } from "./message-date";
type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
  headers?: { name: string; value: string }[];
};
export type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: Part;
};
export function mailText(part: Part): string {
  if (part.filename) return "";
  if (part.mimeType === "multipart/alternative" && part.parts?.length) {
    const plain = part.parts.find(
      (p) => p.mimeType === "text/plain" && !p.filename,
    );
    const preferred = plain && mailText(plain);
    if (preferred) return preferred;
    return part.parts.map(mailText).find(Boolean) ?? "";
  }
  const children = part.parts?.map(mailText).filter(Boolean) ?? [];
  if (children.length) return children.join("\n");
  if (part.body?.data) {
    const decoded = Buffer.from(part.body.data, "base64url").toString("utf8");
    if (part.mimeType === "text/html")
      return decoded
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    if (part.mimeType === "text/plain" || !part.mimeType) return decoded;
  }
  return "";
}
export function normalizeGmail(message: GmailMessage) {
  const headers = Object.fromEntries(
    (message.payload?.headers ?? []).map((h) => [
      h.name.toLowerCase(),
      h.value,
    ]),
  );
  const attachments: Record<string, unknown>[] = [];
  function walk(p: Part) {
    if (p.filename)
      attachments.push({
        filename: p.filename,
        mime_type: p.mimeType,
        attachment_id: p.body?.attachmentId,
        size: p.body?.size,
      });
    p.parts?.forEach(walk);
  }
  if (message.payload) walk(message.payload);
  const title = headers.subject || "(No subject)";
  const content = message.payload ? mailText(message.payload).trim() : "";
  return {
    title,
    content: content || message.snippet || "(Message has no text body)",
    metadata: {
      from: headers.from,
      to: headers.to,
      cc: headers.cc,
      bcc: headers.bcc,
      date: headers.date,
      received_at: message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : undefined,
      thread_id: message.threadId,
      message_id: message.id,
      labels: message.labelIds,
      headers,
      attachments,
      url: `https://mail.google.com/mail/u/0/#all/${message.id}`,
    },
  };
}
export const pumbleMessage = z
  .object({
    id: z.string(),
    text: z.string().default(""),
    author: z.string(),
    channelId: z.string(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    timestampMilli: z.number().optional(),
    deleted: z.boolean().optional(),
    edited: z.boolean().optional(),
    subtype: z.string().optional(),
    threadRootInfo: z.unknown().optional(),
    threadReplyInfo: z.unknown().optional(),
    files: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type PumbleMessage = z.infer<typeof pumbleMessage>;
export function normalizePumble(
  message: PumbleMessage,
  channelName: string,
  users: Record<string, string>,
) {
  return {
    title: `#${channelName} · ${users[message.author] || message.author}`,
    content: message.text || "(Message contains attachments only)",
    metadata: {
      author: users[message.author] || message.author,
      author_id: message.author,
      channel: channelName,
      channel_id: message.channelId,
      message_id: message.id,
      datetime:
        messageDate(message.timestampMilli) ?? messageDate(message.timestamp),
      edited: message.edited,
      type: message.subtype || "message",
      thread_root: message.threadRootInfo,
      thread_reply: message.threadReplyInfo,
      files: message.files,
    },
  };
}
// The API may return an array or a paged envelope. Refuse unknown shapes.
export function pumblePage(raw: unknown) {
  if (Array.isArray(raw))
    return {
      messages: z.array(pumbleMessage).parse(raw),
      hasMore: undefined as boolean | undefined,
    };
  const parsed = z
    .object({
      messages: z.array(pumbleMessage),
      hasMoreBefore: z.boolean().optional(),
    })
    .parse(raw);
  return { messages: parsed.messages, hasMore: parsed.hasMoreBefore };
}
