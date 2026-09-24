"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import type { Memory } from "@/lib/types";

// Render mail as text, never as untrusted HTML. The original remains editable.
function MailText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-7">
      {text
        .split(/(<https?:\/\/[^>\s]+>|https?:\/\/[^\s<>]+|\[image:[^\]]*\])/gi)
        .map((part, i) => {
          if (/^\[image:/i.test(part)) return null;
          const url = part.replace(/^<|>$/g, "");
          if (/^https?:\/\//i.test(url)) {
            try {
              const parsed = new URL(url);
              return (
                <a
                  key={i}
                  href={parsed.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-muted-foreground"
                  title={url}
                >
                  {parsed.hostname.replace(/^www\./, "")}
                </a>
              );
            } catch {
              /* Keep malformed links as plain text. */
            }
          }
          return part;
        })}
    </div>
  );
}
export function EmailContent({ memory }: { memory: Memory }) {
  const [history, setHistory] = useState(false);
  const text = memory.content.replace(/\r\n/g, "\n");
  const split = text.search(
    /^(?:On .{0,400}(?:\n.{0,200})?wrote:|>\s|[-]{2,}\s*Original Message)/m,
  );
  const body = (split < 0 ? text : text.slice(0, split))
    .trim()
    .replace(/\n{3,}/g, "\n\n");
  const quoted = split < 0 ? "" : text.slice(split).trim();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold leading-snug">{memory.title}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {[
          ["From", memory.metadata.from],
          ["To", memory.metadata.to],
          ["Cc", memory.metadata.cc],
          ["Date", memory.metadata.date || memory.metadata.received_at],
        ].map(([label, value]) =>
          typeof value === "string" && value ? (
            <div key={String(label)} className="contents">
              <dt className="text-muted-foreground">{String(label)}</dt>
              <dd className="break-words min-w-0">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      <div className="border-t pt-4">
        <MailText text={body} />
      </div>
      {quoted && (
        <div className="border-t pt-2">
          <Button
            size="xs"
            variant="ghost"
            aria-expanded={history}
            onClick={() => setHistory(!history)}
          >
            {history ? "Hide quoted conversation" : "Show quoted conversation"}
          </Button>
          {history && (
            <div className="mt-3 border-l-2 pl-3 text-muted-foreground">
              <MailText text={quoted.replace(/^> ?/gm, "")} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
