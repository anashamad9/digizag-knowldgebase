"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Connection, Conversation, Memory, Message } from "@/lib/types";
import { newestMemoryFirst } from "@/lib/memory-date";
import { nav, type Page } from "@/lib/view";
import { createUuid } from "@/lib/uuid";
import { toastManager } from "@/components/ui/toast";

const DEMO_USER_ID = "demo-user";
const EMPTY_MESSAGES: Message[] = [];

const starterMemories: Memory[] = [
  {
    id: "memory-brand-voice",
    title: "Digizag brand voice",
    content:
      "Keep communication clear, warm, and direct. Lead with the useful answer, avoid unnecessary jargon, and always end with a concrete next step.",
    source: "note",
    created_at: "2026-09-22T09:30:00.000Z",
    visibility: "workspace",
    metadata: { category: "Brand" },
    owner_id: DEMO_USER_ID,
  },
  {
    id: "memory-launch-plan",
    title: "Q4 launch plan.pdf",
    content:
      "The Q4 launch is planned in three phases: private beta, partner preview, and public release. The public release target is November 12.",
    source: "file",
    created_at: "2026-09-21T13:15:00.000Z",
    visibility: "workspace",
    metadata: { filename: "Q4 launch plan.pdf", indexed: true },
    owner_id: DEMO_USER_ID,
  },
  {
    id: "memory-email",
    title: "Re: Partnership timeline",
    content:
      "Hi team, the partner preview is confirmed for October 28. Please send the final demo link two business days before the session.",
    source: "gmail",
    created_at: "2026-09-20T08:45:00.000Z",
    visibility: "private",
    metadata: {
      from: "Maya Chen <maya@example.com>",
      to: "Alex Morgan <alex@digizag.co>",
      subject: "Re: Partnership timeline",
      date: "2026-09-20T08:45:00.000Z",
    },
    owner_id: DEMO_USER_ID,
  },
  {
    id: "memory-pumble",
    title: "Product · launch-copy",
    content:
      "Let's use the shorter headline in the launch banner and keep the longer explanation for the announcement post.",
    source: "pumble",
    created_at: "2026-09-19T15:20:00.000Z",
    visibility: "workspace",
    metadata: {
      channel: "launch-copy",
      sender: "Nora Ahmed",
      datetime: "2026-09-19T15:20:00.000Z",
    },
    owner_id: "teammate",
  },
];

const starterConversations: Conversation[] = [
  {
    id: "conversation-launch",
    title: "Summarize the launch plan",
    updated_at: "2026-09-22T11:00:00.000Z",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "Summarize the launch plan and key dates.",
        visibility: "private",
      },
      {
        id: "message-2",
        role: "assistant",
        content:
          "The launch has three phases: private beta, partner preview, and public release. The partner preview is set for **October 28**, with the final demo link due two business days earlier. Public release is targeted for **November 12**.",
        sources: [starterMemories[1], starterMemories[2]],
      },
    ],
  },
];

export function useBrain() {
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
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState("");
  const [remember, setRemember] = useState(false);
  const [learn, setLearn] = useState(true);
  const [visibility, setVisibility] = useState<"private" | "workspace">("private");
  const [chatVisibility, setChatVisibility] = useState<"private" | "workspace">("private");
  const [conversations, setConversations] = useState<Conversation[]>(starterConversations);
  const [active, setActive] = useState<string | null>("conversation-launch");
  const [memories, setMemories] = useState<Memory[]>(starterMemories);
  const [connections, setConnections] = useState<Connection[]>([
    {
      id: "connection-gmail",
      provider: "gmail",
      status: "ACTIVE",
      visibility: "private",
      last_synced_at: "2026-09-22T10:00:00.000Z",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Memory | null>(null);
  const [ready, setReady] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState<string | null>(null);
  const [syncCount, setSyncCount] = useState<number | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const current = conversations.find((conversation) => conversation.id === active);
  const messages = current?.messages ?? EMPTY_MESSAGES;

  const notify = useCallback((message: string) => {
    toastManager.add({ title: message });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedPage = params.get("page");
    if (nav.some((item) => item.id === requestedPage)) setPage(requestedPage as Page);
    try {
      const prefs = JSON.parse(localStorage.getItem("brain-frontend-preferences") || "{}");
      setDark(prefs.dark ?? matchMedia("(prefers-color-scheme: dark)").matches);
      setLearn(prefs.learn ?? true);
      setVisibility(prefs.visibility ?? "private");
      setCollapsed(prefs.collapsed ?? false);
    } catch {
      // Ignore an invalid local preference cache.
    }
    setLoading(false);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(
      "brain-frontend-preferences",
      JSON.stringify({ dark, learn, visibility, collapsed }),
    );
  }, [dark, learn, visibility, collapsed, ready]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setPage("chat");
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setDetail(null);
        setMobile(false);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  function go(nextPage: Page) {
    setPage(nextPage);
    setMobile(false);
    history.replaceState(null, "", `?page=${nextPage}`);
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
    const conversationId = active ?? createUuid();
    const message: Message = {
      id: createUuid(),
      role: "user",
      content: text,
      visibility: chatVisibility,
    };
    const nextConversation: Conversation = current
      ? { ...current, messages: [...current.messages, message] }
      : {
          id: conversationId,
          title: text.slice(0, 52),
          messages: [message],
          updated_at: new Date().toISOString(),
        };
    setActive(conversationId);
    setInput("");
    setBusy(true);
    setConversations((items) => [
      nextConversation,
      ...items.filter((item) => item.id !== conversationId),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 450));
    const reply: Message = remember
      ? {
          id: createUuid(),
          role: "assistant",
          content: "Saved in this frontend demo. Your note will remain available until the page is refreshed.",
          saved: true,
        }
      : {
          id: createUuid(),
          role: "assistant",
          content: "This is a frontend-only demo response. The interface is fully interactive, but no message is sent to a server or AI model.",
          sources: memories.slice(0, 2),
        };
    setConversations((items) =>
      items.map((item) =>
        item.id === conversationId ? { ...item, messages: [...item.messages, reply] } : item,
      ),
    );
    if (remember) {
      setMemories((items) => [
        {
          id: createUuid(),
          title: text.slice(0, 60),
          content: text,
          source: "note",
          created_at: new Date().toISOString(),
          visibility: chatVisibility,
          metadata: { conversation_id: conversationId },
          owner_id: DEMO_USER_ID,
        },
        ...items,
      ]);
    }
    setBusy(false);
    setRemember(false);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    setUploading(true);
    const uploaded = files.map<Memory>((file) => ({
      id: createUuid(),
      title: file.webkitRelativePath || file.name,
      content: `Local demo file: ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB).`,
      source: "file",
      created_at: new Date(file.lastModified || Date.now()).toISOString(),
      visibility: page === "chat" ? chatVisibility : visibility,
      metadata: { filename: file.name, indexed: false },
      owner_id: DEMO_USER_ID,
    }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    setMemories((items) => [...uploaded, ...items]);
    setUploading(false);
    notify(`${uploaded.length} local ${uploaded.length === 1 ? "file" : "files"} added to the demo.`);
  }

  async function connect(provider: "gmail" | "pumble") {
    setConnectionBusy(provider);
    await new Promise((resolve) => setTimeout(resolve, 450));
    setConnections((items) => [
      ...items.filter((item) => item.provider !== provider),
      {
        id: `connection-${provider}`,
        provider,
        status: "ACTIVE",
        visibility,
        last_synced_at: new Date().toISOString(),
      },
    ]);
    setConnectionBusy(null);
    notify(`${provider === "gmail" ? "Gmail" : "Pumble"} connected in demo mode.`);
  }

  async function sync(connection: Connection) {
    setConnectionBusy(connection.provider);
    setSyncCount(0);
    for (const count of [8, 17, 24]) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      setSyncCount(count);
    }
    setConnectionBusy(null);
    setSyncCount(null);
    notify("Demo sync complete. No external account was contacted.");
  }

  function stopSync() {
    setConnectionBusy(null);
    setSyncCount(null);
    notify("Demo sync stopped.");
  }

  async function openMemory(memory: Memory) {
    setMemoryBusy(memory.id);
    setDetail({ ...memory });
    setMemoryBusy(null);
  }

  async function saveDetail() {
    if (!detail) return;
    setMemoryBusy("save");
    setMemories((items) => items.map((item) => (item.id === detail.id ? detail : item)));
    setDetail(null);
    setMemoryBusy(null);
    notify("Memory updated locally.");
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting || busy || uploading) return;
    setDeleting(true);
    const target = pendingDelete;
    if (target.kind === "chat") {
      setConversations((items) => items.filter((item) => item.id !== target.id));
      if (active === target.id) newChat();
    } else if (target.kind === "connection") {
      setConnections((items) => items.filter((item) => item.id !== target.id));
    } else {
      setMemories((items) => items.filter((item) => item.id !== target.id));
    }
    setDetail(null);
    setPendingDelete(null);
    setDeleting(false);
    notify("Removed from the local demo.");
  }

  const shown = useMemo(
    () =>
      memories
        .filter(
          (memory) =>
            (filter === "all" || memory.source === filter) &&
            `${memory.title} ${memory.content}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort(newestMemoryFirst),
    [memories, filter, query],
  );

  return {
    isOwner: true,
    pendingDelete,
    setPendingDelete,
    deleting,
    confirmDelete,
    name: "Alex Morgan",
    userId: DEMO_USER_ID,
    collapsed,
    setCollapsed,
    loading,
    memoryBusy,
    email: "alex@digizag.co",
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
  };
}

export type BrainState = ReturnType<typeof useBrain>;
