"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Memory, Message, Conversation, Connection } from "@/lib/types";
import { newestMemoryFirst } from "@/lib/memory-date";
import { nav, type Page } from "@/lib/view";
import { readChatStream } from "@/lib/chat-stream";
import { browserDb } from "@/lib/supabase/client";
import { createUuid } from "@/lib/uuid";
import { toastManager } from "@/components/ui/toast";
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
const EMPTY_MESSAGES: Message[] = [];
const json = (value: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
export function useBrain({
  email,
  name,
  userId,
  isOwner,
}: {
  email: string;
  name: string;
  userId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "chat" | "memory" | "connection";
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState<Page>("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memoryBusy, setMemoryBusy] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState("");
  const [remember, setRemember] = useState(false);
  const [learn, setLearn] = useState(true);
  const [visibility, setVisibility] = useState<"private" | "workspace">(
    "private",
  );
  const [chatVisibility, setChatVisibility] = useState<"private" | "workspace">(
    "private",
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Memory | null>(null);
  const [ready, setReady] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState<string | null>(null);
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const syncControl = useRef({ running: false, stop: false });
  useEffect(
    () => () => {
      syncControl.current.stop = true;
    },
    [],
  );
  function stopSync() {
    syncControl.current.stop = true;
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const current = conversations.find((c) => c.id === active);
  const messages = current?.messages ?? EMPTY_MESSAGES;
  const notify = useCallback((message: string) => {
    toastManager.add({ title: message });
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        memories: Memory[];
        conversations: Conversation[];
      }>("/api/memory");
      setMemories(data.memories);
      setConversations(data.conversations);
      const c = await api<{ connections: Connection[] }>("/api/connections");
      setConnections(c.connections);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("connection_error"))
      notify("The app connection did not complete. Please try again.");
    if (params.has("connected")) notify("Connected. Select Sync to import.");
    const p = params.get("page");
    if (nav.some((n) => n.id === p) && (p !== "users" || isOwner))
      setPage(p as Page);
    try {
      const prefs = JSON.parse(
        localStorage.getItem("brain-preferences") || "{}",
      );
      setDark(prefs.dark ?? matchMedia("(prefers-color-scheme: dark)").matches);
      setLearn(prefs.learn ?? true);
      setVisibility(prefs.visibility ?? "private");
      setCollapsed(prefs.collapsed ?? false);
    } catch {
      /* Ignore invalid local cache. */
    }
    setReady(true);
    void refresh();
  }, [refresh, notify, isOwner]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(
      "brain-preferences",
      JSON.stringify({ dark, learn, visibility, collapsed }),
    );
  }, [dark, learn, visibility, collapsed, ready]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("chat");
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setDetail(null);
        setMobile(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function go(p: Page) {
    setPage(p === "users" && !isOwner ? "chat" : p);
    setMobile(false);
    history.replaceState(null, "", `?page=${p}`);
  }
  function newChat() {
    setActive(null);
    setInput("");
    setRemember(false);
    setChatVisibility("private");
    go("chat");
    setTimeout(() => inputRef.current?.focus(), 30);
  }
  async function send() {
    const text = input.trim();
    if (!text || busy || uploading || deleting) return;
    const id = active ?? createUuid();
    const message: Message = {
      id: createUuid(),
      role: "user",
      content: text,
      visibility: chatVisibility,
    };
    setActive(id);
    setInput("");
    setBusy(true);
    const next = current
      ? { ...current, messages: [...current.messages, message] }
      : {
          id,
          title: text.slice(0, 52),
          messages: [message],
          updated_at: new Date().toISOString(),
        };
    setConversations((cs) => [next, ...cs.filter((c) => c.id !== id)]);
    try {
      const response = await fetch(
        "/api/chat",
        json({
          text,
          conversationId: id,
          messageId: message.id,
          remember,
          learn,
          visibility: chatVisibility,
        }),
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Message failed.");
      }
      const replyId = createUuid();
      setConversations((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: replyId,
                    role: "assistant",
                    content: "",
                    streaming: true,
                  },
                ],
              }
            : c,
        ),
      );
      await readChatStream(response, (event) => {
        if (event.type === "error") throw new Error(event.message);
        setConversations((cs) =>
          cs.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === replyId
                      ? event.type === "delta"
                        ? { ...m, content: m.content + event.text }
                        : { ...m, ...event, streaming: false }
                      : m,
                  ),
                }
              : c,
          ),
        );
      });
      const data = await api<{ memories: Memory[] }>(
        "/api/memory?only=memories",
      );
      setMemories(data.memories);
    } catch (e) {
      notify((e as Error).message);
      setConversations((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.streaming
                    ? {
                        ...m,
                        streaming: false,
                        content:
                          m.content +
                          "\n\nResponse interrupted. Please try again.",
                      }
                    : m,
                ),
              }
            : c,
        ),
      );
      setInput(text);
    } finally {
      setBusy(false);
      setRemember(false);
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    setUploading(true);
    const uploadConversation =
      page === "chat" ? (active ?? createUuid()) : null;
    if (uploadConversation) setActive(uploadConversation);
    let count = 0;
    for (const file of files) {
      try {
        if (file.size > 4_000_000)
          throw new Error(`${file.name}: maximum file size is 4 MB.`);
        const form = new FormData();
        form.append("file", file);
        form.append("path", file.webkitRelativePath || file.name);
        form.append(
          "visibility",
          page === "chat" ? chatVisibility : visibility,
        );
        if (uploadConversation)
          form.append("conversationId", uploadConversation);
        const result = await api<{ indexed: boolean }>("/api/upload", {
          method: "POST",
          body: form,
        });
        if (!result.indexed)
          notify(`${file.name}: stored; contents are not searchable.`);
        count++;
      } catch (e) {
        notify((e as Error).message);
      }
    }
    if (count)
      notify(
        `${count} ${count === 1 ? "document" : "documents"} added to memory.`,
      );
    void refresh();
    setUploading(false);
  }
  async function connect(provider: "gmail" | "pumble") {
    setConnectionBusy(provider);
    try {
      const { url } = await api<{ url: string }>(
        "/api/connections",
        json({ provider, visibility }),
      );
      location.assign(url);
    } catch (e) {
      notify((e as Error).message);
      setConnectionBusy(null);
    }
  }
  async function sync(connection: Connection) {
    if (syncControl.current.running || connectionBusy) return;
    syncControl.current = { running: true, stop: false };
    setConnectionBusy(connection.provider);
    setSyncCount(0);
    let count = 0;
    try {
      let more = true;
      let warning: string | null = null;
      while (more && !syncControl.current.stop) {
        const data = await api<{
          count: number;
          more: boolean;
          warning?: string | null;
        }>("/api/sync", json({ id: connection.id }));
        warning = data.warning ?? warning;
        count += data.count;
        more = data.more;
        setSyncCount(count);
      }
      notify(
        `${count} items processed. ${more ? "Sync paused; select Sync to resume." : warning ? "Sync finished with skipped channels." : "Sync complete."}${warning ? ` ${warning}` : ""}`,
      );
      const [data, apps] = await Promise.all([
        api<{ memories: Memory[] }>("/api/memory"),
        api<{ connections: Connection[] }>("/api/connections"),
      ]);
      setMemories(data.memories);
      setConnections(apps.connections);
    } catch (e) {
      notify(
        `${count} items processed. ${(e as Error).message} Select Sync to resume.`,
      );
    } finally {
      syncControl.current.running = false;
      setSyncCount(null);
      setConnectionBusy(null);
    }
  }
  async function openMemory(memory: Memory) {
    setMemoryBusy(memory.id);
    try {
      const data = await api<{ memory: Memory }>(`/api/memory?id=${memory.id}`);
      setDetail(data.memory);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setMemoryBusy(null);
    }
  }
  async function saveDetail() {
    if (!detail) return;
    setMemoryBusy("save");
    try {
      await api("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.id,
          title: detail.title,
          content: detail.content,
          visibility: detail.visibility,
        }),
      });
      setMemories((ms) => ms.map((m) => (m.id === detail.id ? detail : m)));
      setDetail(null);
      notify("Memory updated.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setMemoryBusy(null);
    }
  }
  const shown = memories
    .filter(
      (m) =>
        (filter === "all" || m.source === filter) &&
        `${m.title} ${m.content}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(newestMemoryFirst);

  async function signOut() {
    stopSync();
    setSigningOut(true);
    try {
      const { error } = await browserDb().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      notify("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting || busy || uploading) return;
    setDeleting(true);
    try {
      const endpoint =
        pendingDelete.kind === "chat"
          ? "/api/conversations"
          : pendingDelete.kind === "connection"
            ? "/api/connections"
            : "/api/memory";
      const result = await api<{ cleanupPending?: boolean }>(endpoint, {
        ...json({ id: pendingDelete.id }),
        method: "DELETE",
      });
      if (pendingDelete.kind === "chat") {
        const deletedId = pendingDelete.id;
        setConversations((items) => items.filter((item) => item.id !== deletedId));
        setMemories((items) =>
          items.filter((item) => item.metadata.conversation_id !== deletedId),
        );
        if (active === deletedId) newChat();
      }
      setDetail(null);
      setPendingDelete(null);
      if (pendingDelete.kind !== "chat") await refresh();
      notify(
        result.cleanupPending
          ? "Memory deleted. Original file cleanup will retry in the background."
          : "Deleted from memory.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return {
    isOwner,
    pendingDelete,
    setPendingDelete,
    deleting,
    confirmDelete,
    name,
    userId,
    collapsed,
    setCollapsed,
    loading,
    memoryBusy,
    signingOut,
    email,
    page,
    mobile,
    setMobile,
    dark,
    setDark,
    input,
    setInput,
    remember,
    setRemember,
    learn,
    setLearn,
    visibility,
    setVisibility,
    chatVisibility,
    setChatVisibility,
    conversations,
    active,
    setActive,
    memories,
    connections,
    busy,
    uploading,
    filter,
    setFilter,
    query,
    setQuery,
    detail,
    setDetail,
    ready,
    connectionBusy,
    syncCount,
    stopSync,
    inputRef,
    fileRef,
    folderRef,
    endRef,
    messages,
    shown,
    notify,
    go,
    newChat,
    send,
    upload,
    connect,
    sync,
    openMemory,
    saveDetail,
    signOut,
  };
}
export type BrainState = ReturnType<typeof useBrain>;
