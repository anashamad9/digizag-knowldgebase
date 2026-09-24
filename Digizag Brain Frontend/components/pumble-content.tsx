import { Badge } from "./ui/badge";
import { messageDate } from "@/lib/message-date";
import type { Memory } from "@/lib/types";
export function PumbleContent({ memory }: { memory: Memory }) {
  const meta = memory.metadata;
  const date = messageDate(meta.datetime);
  const author =
    typeof meta.author === "string" ? meta.author : "Unknown sender";
  const channel =
    typeof meta.channel === "string"
      ? `#${meta.channel.replace(/^#/, "")}`
      : "Unknown channel";
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">From</dt>
        <dd className="min-w-0 break-words font-medium">{author}</dd>
        <dt className="text-muted-foreground">Channel</dt>
        <dd className="min-w-0 break-words">{channel}</dd>
        <dt className="text-muted-foreground">Sent</dt>
        <dd>
          {date ? (
            <time dateTime={date} title={`Original timestamp: ${date}`}>
              {new Intl.DateTimeFormat(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
              }).format(new Date(date))}
            </time>
          ) : (
            "Date unavailable"
          )}
        </dd>
      </dl>
      {!!(meta.edited || meta.thread_reply || meta.thread_root) && (
        <div className="flex flex-wrap gap-1">
          {meta.edited === true && (
            <Badge size="sm" variant="warning">
              Edited
            </Badge>
          )}
          {!!meta.thread_reply && (
            <Badge size="sm" variant="info">
              Thread reply
            </Badge>
          )}
          {!meta.thread_reply && !!meta.thread_root && (
            <Badge size="sm" variant="info">
              Thread
            </Badge>
          )}
        </div>
      )}
      <div className="border-t pt-4 whitespace-pre-wrap break-words text-sm leading-6">
        {memory.content}
      </div>
    </div>
  );
}
