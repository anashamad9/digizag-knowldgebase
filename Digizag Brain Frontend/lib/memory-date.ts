import { messageDate } from "./message-date";
import type { Memory } from "./types";
export function memoryDate(
  memory: Pick<Memory, "source" | "metadata" | "created_at">,
): string | null {
  if (memory.source === "gmail")
    return (
      messageDate(memory.metadata.date) ??
      messageDate(memory.metadata.received_at)
    );
  if (memory.source === "pumble") return messageDate(memory.metadata.datetime);
  return messageDate(memory.created_at);
}
export function newestMemoryFirst(a: Memory, b: Memory) {
  const aDate = memoryDate(a),
    bDate = memoryDate(b);
  if (aDate === bDate) return a.id.localeCompare(b.id);
  if (!aDate) return 1;
  if (!bDate) return -1;
  return bDate.localeCompare(aDate);
}
