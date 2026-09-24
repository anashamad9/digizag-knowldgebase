export type Source = "note" | "gmail" | "pumble" | "file";
export type Memory = {
  id: string;
  title: string;
  content: string;
  source: Source;
  created_at: string;
  visibility: "private" | "workspace";
  metadata: Record<string, unknown>;
  owner_id?: string;
  revisions?: {
    id: string;
    title: string;
    content: string;
    replaced_at: string;
  }[];
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Memory[];
  saved?: boolean;
  streaming?: boolean;
  visibility?: "private" | "workspace";
};
export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updated_at: string;
};
export type Connection = {
  id: string;
  provider: "gmail" | "pumble";
  status: string;
  last_synced_at?: string;
  error?: string;
  visibility: "private" | "workspace";
};
