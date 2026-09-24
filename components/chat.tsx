import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { FileIcon } from "./file-icon";
import { Badge } from "./ui/badge";
import { Spinner } from "./ui/spinner";
import { Icon } from "./icon";
import { SourceIcon } from "./source-icon";
import type { BrainState } from "@/hooks/use-brain";
export function Chat({ brain: b }: { brain: BrainState }) {
  const { inputRef, endRef, fileRef } = b;
  const hasMessages = b.messages.length > 0;
  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col px-4">
      {hasMessages ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
            {b.messages.map((m) => (
              <article
                key={m.id}
                data-role={m.role}
                className={
                  m.role === "user" ? "ml-auto max-w-[85%] text-sm" : "text-sm"
                }
              >
                {m.role === "assistant" && (
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                    Brain
                  </div>
                )}
                {m.role === "user" && m.visibility && (
                  <div className="mb-1 text-right">
                    <Badge
                      size="sm"
                      variant={
                        m.visibility === "workspace" ? "info" : "warning"
                      }
                    >
                      {m.visibility === "workspace" ? "Team" : "Only me"}
                    </Badge>
                  </div>
                )}
                <div className="leading-6 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
                {m.streaming && (
                  <span
                    aria-label="Generating response"
                    className="typing-cursor"
                  />
                )}
                {!!m.sources?.length && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.sources.map((s, i) => (
                      <Button
                        key={`${s.id}-${i}`}
                        variant="outline"
                        size="xs"
                        loading={b.memoryBusy === s.id}
                        onClick={() => void b.openMemory(s)}
                      >
                        {s.source === "file" ? (
                          <FileIcon name={s.title} size={14} />
                        ) : (
                          <SourceIcon source={s.source} size={14} />
                        )}
                        <span className="max-w-44 truncate">
                          {i + 1}. {s.title}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
                {m.saved && (
                  <Badge variant="success" size="sm" className="mt-2">
                    <Icon name="check" size={12} />
                    Saved
                  </Badge>
                )}
                {m.role === "assistant" && !m.streaming && (
                  <Button
                    className="mt-1"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy response"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(m.content)
                        .then(() => b.notify("Copied."))
                        .catch(() => b.notify("Clipboard unavailable."))
                    }
                  >
                    <Icon name="copy" size={13} />
                  </Button>
                )}
              </article>
            ))}
            {b.busy && !b.messages.some((m) => m.streaming && m.content) && (
              <div
                role="status"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Spinner />
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <div
        className={`mx-auto w-full max-w-2xl ${hasMessages ? "pb-4 pt-3" : "pb-0"}`}
      >
        <Textarea
          ref={inputRef}
          size="sm"
          value={b.input}
          onChange={(e) => b.setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void b.send();
            }
          }}
          placeholder={
            b.remember ? "What should I remember?" : "Ask or share an update…"
          }
          aria-label="Message Brain"
          maxLength={12000}
          rows={2}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={b.uploading || b.busy}
              loading={b.uploading}
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="attach" size={14} />
            </Button>
            <Button
              variant={b.remember ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={b.remember}
              onClick={() => b.setRemember(!b.remember)}
            >
              <Icon name="brain" size={13} />
              Remember
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant={b.chatVisibility === "workspace" ? "secondary" : "ghost"}
              size="xs"
              aria-label="Share saved information with team"
              aria-pressed={b.chatVisibility === "workspace"}
              onClick={() =>
                b.setChatVisibility(
                  b.chatVisibility === "private" ? "workspace" : "private",
                )
              }
            >
              <Icon
                name={b.chatVisibility === "private" ? "lock" : "users"}
                size={13}
              />
              {b.chatVisibility === "private" ? "Only me" : "Team"}
            </Button>
            <Button
              size="icon-xs"
              disabled={!b.input.trim() || b.busy || b.loading || b.uploading}
              loading={b.busy}
              aria-label="Send message"
              onClick={() => void b.send()}
            >
              <Icon name="up" size={15} />
            </Button>
          </div>
        </div>
      </div>
      {!hasMessages && <div className="flex-1" />}
    </section>
  );
}
