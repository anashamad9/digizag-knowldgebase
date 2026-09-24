import OpenAI from "openai";
import { queryIdentifiers } from "./knowledge";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, check } from "./api";
import type { Memory, Source } from "./types";
export const model = () => process.env.OPENAI_MODEL || "gpt-5.6-sol";
export function ai() {
  if (!process.env.OPENAI_API_KEY)
    throw new ApiError(
      "The workspace needs an OpenAI API key before it can answer or index documents.",
      503,
    );
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 90000,
    maxRetries: 2,
  });
}
export function chunkText(text: string, size = 4500, overlap = 400): string[] {
  if (size <= overlap || overlap < 0) throw new Error("Invalid chunk size");
  const cleaned = text.replace(/\u0000/g, "").trim();
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += size - overlap)
    chunks.push(cleaned.slice(i, i + size));
  return chunks;
}
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export async function embed(texts: string[]) {
  const vectors: number[][] = [];
  const client = ai();
  for (let offset = 0; offset < texts.length; offset += 16) {
    const result = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: texts.slice(offset, offset + 16),
      dimensions: 1536,
    });
    vectors.push(
      ...result.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
    );
  }
  return vectors;
}
type Input = {
  id?: string;
  workspace_id: string;
  owner_id: string;
  connection_id?: string;
  external_id?: string;
  title: string;
  content: string;
  source: Source;
  visibility: "private" | "workspace";
  metadata?: Record<string, unknown>;
};
export async function ingest(db: SupabaseClient, input: Input) {
  const content = input.content.replace(/\u0000/g, "").trim();
  if (!content)
    throw new ApiError(
      "No readable text was found. For scanned PDFs, upload a version with selectable text.",
    );
  const { headers: _headers, ...searchMetadata } = input.metadata ?? {};
  void _headers;
  const chunks = chunkText(
    `${input.title}\n${JSON.stringify(searchMetadata)}\n\n${content}`,
  );
  const vectors = await embed(chunks);
  const { data, error } = await db.rpc("write_memory", {
    record: { ...input, content, content_hash: hash(content) },
    pieces: chunks.map((c, i) => ({
      content: c,
      position: i,
      embedding: JSON.stringify(vectors[i]),
    })),
  });
  check(error);
  return data as string;
}
export async function retrieve(
  db: SupabaseClient,
  workspaceId: string,
  query: string,
): Promise<Memory[]> {
  const [vector] = await embed([query]);
  const { data, error } = await db.rpc("search_memory_v2", {
    query_embedding: JSON.stringify(vector),
    query_text: query,
    target_workspace: workspaceId,
    identifiers: queryIdentifiers(query),
  });
  if (error?.code === "PGRST202")
    throw new ApiError(
      "Run 004_knowledge.sql in Supabase to enable knowledge retrieval.",
      503,
    );
  check(error);
  return data ?? [];
}
