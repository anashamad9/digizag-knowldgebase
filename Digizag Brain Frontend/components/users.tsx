"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
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
import { createUuid } from "@/lib/uuid";

type User = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  disabled: boolean;
  last_login?: string;
};

const starterUsers: User[] = [
  {
    id: "demo-user",
    email: "alex@digizag.co",
    name: "Alex Morgan",
    role: "owner",
    disabled: false,
    last_login: "2026-09-23T08:20:00.000Z",
  },
  {
    id: "demo-user-2",
    email: "nora@digizag.co",
    name: "Nora Ahmed",
    role: "member",
    disabled: false,
    last_login: "2026-09-22T14:10:00.000Z",
  },
  {
    id: "demo-user-3",
    email: "sam@digizag.co",
    name: "Sam Lee",
    role: "member",
    disabled: true,
  },
];

export function Users() {
  const [users, setUsers] = useState<User[]>(starterUsers);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function edit(user: User | "new") {
    setName(user === "new" ? "" : user.name);
    setEmail(user === "new" ? "" : user.email);
    setEditing(user);
  }

  function save() {
    if (!editing) return;
    if (editing === "new") {
      setUsers((items) => [
        ...items,
        { id: createUuid(), name, email, role: "member", disabled: false },
      ]);
    } else {
      setUsers((items) =>
        items.map((item) =>
          item.id === editing.id ? { ...item, name, email } : item,
        ),
      );
    }
    setEditing(null);
  }

  return (
    <section aria-label="Users" className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Demo users</span>
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
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div>{user.name || user.email}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </TableCell>
              <TableCell>
                <Badge variant={user.disabled ? "warning" : user.role === "owner" ? "info" : "success"}>
                  {user.disabled ? "Suspended" : user.role === "owner" ? "Owner" : "Active"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {user.last_login ? new Date(user.last_login).toLocaleString() : "Never"}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="xs" variant="ghost" onClick={() => edit(user)}>Edit</Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={user.role === "owner"}
                    onClick={() =>
                      setUsers((items) =>
                        items.map((item) =>
                          item.id === user.id ? { ...item, disabled: !item.disabled } : item,
                        ),
                      )
                    }
                  >
                    {user.disabled ? "Enable" : "Suspend"}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive-foreground"
                    disabled={user.role === "owner"}
                    onClick={() => setRemoving(user)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogPopup showCloseButton={false}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <DialogHeader>
                <DialogTitle>{editing === "new" ? "Add user" : "Edit user"}</DialogTitle>
              </DialogHeader>
              <DialogPanel>
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="user-name">Name</Label>
                    <Input id="user-name" size="sm" required value={name} onChange={(event) => setName(event.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="user-email">Email</Label>
                    <Input id="user-email" type="email" size="sm" required value={email} onChange={(event) => setEmail(event.target.value)} />
                  </div>
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button size="sm" type="submit">Save locally</Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>
      )}
      {removing && (
        <ConfirmDelete
          title="Delete user?"
          description={`Remove ${removing.email} from this frontend demo?`}
          busy={false}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            setUsers((items) => items.filter((item) => item.id !== removing.id));
            setRemoving(null);
          }}
        />
      )}
    </section>
  );
}
