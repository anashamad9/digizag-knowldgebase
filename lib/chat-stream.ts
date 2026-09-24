import type { Memory } from "./types";
export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; content: string; sources: Memory[]; saved: boolean }
  | { type: "error"; message: string };

// Decode only a complete prefix of the first JSON string. Never expose memory
// extraction JSON or a half-decoded escape sequence to the conversation UI.
export function answerPrefix(json: string): string {
  const match = /^\s*\{\s*"answer"\s*:\s*"/.exec(json);
  if (!match) return "";
  let raw = "";
  for (let i = match[0].length; i < json.length; i++) {
    const char = json[i];
    if (char === '"') break;
    if (char === "\\") {
      const length = json[i + 1] === "u" ? 6 : 2;
      if (i + length > json.length) break;
      raw += json.slice(i, i + length);
      i += length - 1;
    } else raw += char;
  }
  const result: string = JSON.parse('"' + raw + '"');
  // A surrogate pair may arrive in separate provider events.
  return /[\uD800-\uDBFF]$/.test(result) ? result.slice(0, -1) : result;
}

export async function readChatStream(
  response: Response,
  onEvent: (event: ChatEvent) => void,
) {
  if (!response.body) throw new Error("Response stream unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ChatEvent;
        onEvent(event);
        if (event.type === "done") done = true;
      }
      if (chunk.done) break;
    }
    if (!done) throw new Error("Response interrupted. Please try again.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
