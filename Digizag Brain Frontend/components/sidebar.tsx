import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./ui/menu";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Icon } from "./icon";
import { nav } from "@/lib/view";
import type { BrainState } from "@/hooks/use-brain";
export function Sidebar({
  brain: b,
  compact = false,
}: {
  brain: BrainState;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 ${compact ? "items-center pointer-events-auto" : "p-4"}`}
    >
      <div className="flex h-8 items-center justify-between">
        {!compact && <span className="wordmark px-2 text-2xl">Brain</span>}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={compact ? "Open sidebar" : "Close sidebar"}
          onClick={() => {
            if (b.mobile) b.setMobile(false);
            else b.setCollapsed(!b.collapsed);
          }}
        >
          <Icon name="sidebar" size={16} />
        </Button>
      </div>
      {!compact && (
        <>
          <Button
            size={compact ? "icon-sm" : "sm"}
            variant="outline"
            className={compact ? "" : "justify-start"}
            aria-label="New chat"
            onClick={b.newChat}
          >
            <Icon name="plus" size={15} />
            {!compact && "New chat"}
          </Button>
          <nav aria-label="Main navigation" className="flex flex-col gap-1">
            {nav
              .filter(
                (item) =>
                  item.id !== "chat" && (item.id !== "users" || b.isOwner),
              )
              .map((item) => (
                <Button
                  key={item.id}
                  size={compact ? "icon-sm" : "sm"}
                  variant={b.page === item.id ? "secondary" : "ghost"}
                  className={compact ? "" : "justify-start"}
                  aria-label={item.label}
                  title={compact ? item.label : undefined}
                  aria-current={b.page === item.id ? "page" : undefined}
                  onClick={() => b.go(item.id)}
                >
                  <Icon name={item.icon} size={15} />
                  {!compact && item.label}
                </Button>
              ))}
          </nav>
        </>
      )}
      {!compact && (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          <p className="mb-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
            Chats {b.loading && <Spinner />}
          </p>
          <div className="flex flex-col gap-1">
            {b.conversations.map((c) => (
              <div key={c.id} className="group relative min-w-0">
                <Button
                  size="sm"
                  variant={
                    b.active === c.id && b.page === "chat"
                      ? "secondary"
                      : "ghost"
                  }
                  className="w-full min-w-0 justify-start pr-9"
                  title={c.title}
                  onClick={() => {
                    b.setActive(c.id);
                    b.go("chat");
                  }}
                >
                  <span className="truncate">{c.title}</span>
                </Button>
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
                        aria-label={`Chat options: ${c.title}`}
                      />
                    }
                  >
                    <Icon name="more" size={14} />
                  </MenuTrigger>
                  <MenuPopup>
                    <MenuItem
                      variant="destructive"
                      disabled={b.busy || b.uploading}
                      onClick={() =>
                        b.setPendingDelete({
                          kind: "chat",
                          id: c.id,
                          title: c.title,
                        })
                      }
                    >
                      <Icon name="delete" size={14} />
                      Delete chat
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        className={`mt-auto flex gap-1 ${compact ? "flex-col items-center gap-2" : "items-center"}`}
      >
        {!compact && (
          <span
            className="min-w-0 flex-1 truncate px-2 text-xs"
            title={b.email}
          >
            {b.name}
          </span>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => b.setDark(!b.dark)}
          aria-label={b.dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Icon name={b.dark ? "sun" : "moon"} size={14} />
        </Button>
      </div>
    </div>
  );
}
