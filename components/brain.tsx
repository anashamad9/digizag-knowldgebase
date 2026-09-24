"use client";
import { useBrain } from "@/hooks/use-brain";
import { ConfirmDelete } from "./confirm-delete";
import { Users } from "./users";
import { Sidebar } from "./sidebar";
import { Chat } from "./chat";
import { Apps } from "./apps";
import { Data } from "./data";
import { Settings } from "./settings";
import { Tasks } from "./tasks";
import { MemoryDialog } from "./memory-dialog";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Input } from "./ui/input";
import { Sheet, SheetPopup, SheetTitle } from "./ui/sheet";
import { Icon } from "./icon";
export default function Brain(props: {
  email: string;
  name: string;
  userId: string;
  isOwner: boolean;
  avatarUrl: string | null;
}) {
  const b = useBrain(props);
  const { fileRef, folderRef } = b;
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={`hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out motion-reduce:transition-none md:block ${b.collapsed ? "w-0 border-0" : "w-64 border-r bg-neutral-50 dark:bg-[#090909]"}`}
      >
        {!b.collapsed && <Sidebar brain={b} />}
      </aside>
      {b.collapsed && (
        <div className="fixed inset-y-0 left-0 z-20 hidden w-12 py-3 md:block pointer-events-none">
          <Sidebar brain={b} compact />
        </div>
      )}
      <Sheet open={b.mobile} onOpenChange={b.setMobile}>
        <SheetPopup
          side="left"
          showCloseButton={false}
          className="max-w-64 bg-neutral-50 dark:bg-[#090909]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar brain={b} />
        </SheetPopup>
      </Sheet>
      <main
        className={`flex min-w-0 flex-1 flex-col ${b.collapsed ? "md:pl-12" : ""}`}
      >
        <Button
          size="icon-xs"
          variant="ghost"
          className="m-3 self-start md:hidden"
          aria-label="Open sidebar"
          onClick={() => b.setMobile(true)}
        >
          <Icon name="sidebar" size={16} />
        </Button>
        {b.loading && (
          <div
            role="status"
            aria-label="Loading workspace"
            className="absolute right-4 top-4"
          >
            <Spinner />
          </div>
        )}
        {b.page === "chat" && <Chat brain={b} />}
        {b.page === "tasks" && (
          <div className="overflow-y-auto">
            <Tasks />
          </div>
        )}
        {b.page === "apps" && (
          <div className="overflow-y-auto">
            <Apps brain={b} />
          </div>
        )}
        {b.page === "data" && (
          <div className="overflow-y-auto">
            <Data brain={b} />
          </div>
        )}
        {b.page === "users" && b.isOwner && (
          <div className="overflow-y-auto">
            <Users />
          </div>
        )}
        {b.page === "settings" && (
          <div className="overflow-y-auto">
            <Settings brain={b} />
          </div>
        )}
      </main>
      <Input
        ref={fileRef}
        nativeInput
        type="file"
        multiple
        className="hidden"
        onChange={b.upload}
      />
      <Input
        ref={folderRef}
        nativeInput
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={b.upload}
      />
      {b.pendingDelete && (
        <ConfirmDelete
          title={`Delete ${b.pendingDelete.kind === "connection" ? "connection" : b.pendingDelete.kind === "chat" ? "chat" : "file or memory"}?`}
          description={
            b.pendingDelete.kind === "chat"
              ? "This permanently deletes the chat, its saved facts, uploaded files, and generated files from memory, including anything shared with your team."
              : b.pendingDelete.kind === "connection"
                ? "This disconnects the app and deletes all memory imported from this account."
                : "This permanently removes the file or note and its indexed information from memory, including team access."
          }
          busy={b.deleting}
          onClose={() => b.setPendingDelete(null)}
          onConfirm={() => void b.confirmDelete()}
        />
      )}
      {b.detail && !b.pendingDelete && (
        <MemoryDialog
          busy={!!b.memoryBusy}
          readOnly={b.detail.owner_id !== b.userId}
          memory={b.detail}
          onChange={b.setDetail}
          onClose={() => b.setDetail(null)}
          onSave={() => void b.saveDetail()}
          onRemove={() =>
            b.setPendingDelete({
              kind: "memory",
              id: b.detail!.id,
              title: b.detail!.title,
            })
          }
        />
      )}
    </div>
  );
}
