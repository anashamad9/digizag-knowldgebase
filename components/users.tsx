"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Spinner } from "./ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "./ui/dialog";
import { ConfirmDelete } from "./confirm-delete";
import { toastManager } from "./ui/toast";
import { Avatar } from "./avatar";
type User = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  disabled: boolean;
  last_login?: string;
  created_at: string;
  avatar_url: string | null;
};
export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const notify = (title: string) => toastManager.add({ title });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/users?page=${page}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setUsers(d.users);
      setTotal(d.total);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function mutate(method: string, body: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEditing(null);
      setRemoving(null);
      setPassword("");
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(u: User | "new") {
    setName(u === "new" ? "" : u.name);
    setEmail(u === "new" ? "" : u.email);
    setPassword("");
    setEditing(u);
  }
  return (
    <section aria-label="Users" className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Users {loading && <Spinner />}
        </span>
        <Button size="sm" variant="outline" onClick={() => edit("new")}>
          Add user
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={u.name || u.email}
                    src={u.avatar_url}
                    size={30}
                  />
                  <div className="min-w-0">
                    <div>{u.name || u.email}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    u.disabled
                      ? "warning"
                      : u.role === "owner"
                        ? "info"
                        : "success"
                  }
                >
                  {u.disabled
                    ? "Suspended"
                    : u.role === "owner"
                      ? "Owner"
                      : "Active"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {u.last_login
                  ? new Date(u.last_login).toLocaleString()
                  : "Never"}
              </TableCell>
              <TableCell>
                {
                  <div className="flex justify-end gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => edit(u)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      loading={busy}
                      disabled={u.role === "owner"}
                      title={
                        u.role === "owner"
                          ? "The owner cannot be suspended"
                          : undefined
                      }
                      onClick={() =>
                        void mutate("PATCH", {
                          id: u.id,
                          disabled: !u.disabled,
                        })
                      }
                    >
                      {u.disabled ? "Enable" : "Suspend"}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive-foreground"
                      disabled={busy || u.role === "owner"}
                      title={
                        u.role === "owner"
                          ? "The owner account cannot be deleted"
                          : undefined
                      }
                      onClick={() => setRemoving(u)}
                    >
                      Delete
                    </Button>
                  </div>
                }
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {total > 50 && (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={page * 50 >= total || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {editing && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v && !busy) {
              setEditing(null);
              setPassword("");
            }
          }}
        >
          <DialogPopup showCloseButton={false}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(editing === "new" ? "POST" : "PATCH", {
                  ...(editing !== "new" ? { id: editing.id } : {}),
                  name,
                  email,
                  ...(password ? { password } : {}),
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editing === "new" ? "Add user" : "Edit user"}
                </DialogTitle>
              </DialogHeader>
              <DialogPanel>
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="user-name">Name</Label>
                    <Input
                      id="user-name"
                      size="sm"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="user-email">Email</Label>
                    <Input
                      id="user-email"
                      type="email"
                      size="sm"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="user-password">
                      {editing === "new"
                        ? "Password"
                        : "New password (optional)"}
                    </Label>
                    <Input
                      id="user-password"
                      size="sm"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required={editing === "new"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setPassword("");
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" type="submit" loading={busy}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>
      )}
      {removing && (
        <ConfirmDelete
          title="Delete user?"
          description={`Permanently delete ${removing.email}, their chats, files, app connections, and all their memory, including information shared with the team.`}
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={() => void mutate("DELETE", { id: removing.id })}
        />
      )}
    </section>
  );
}
