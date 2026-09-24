"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Spinner } from "./ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Textarea } from "./ui/textarea";
import { ConfirmDelete } from "./confirm-delete";
import { toastManager } from "./ui/toast";
import { Avatar } from "./avatar";

type TaskStatus = "pending" | "on_it" | "done" | "issue";
type Priority = "low" | "medium" | "high" | "urgent";
type User = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
};
type Task = {
  id: string;
  title: string;
  details: string;
  assignee_id: string | null;
  creator_id: string | null;
  priority: Priority;
  deadline: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

const statuses: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "on_it", label: "On it" },
  { value: "done", label: "Done" },
  { value: "issue", label: "Issue" },
];
const priorities: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];
const badgeVariant = {
  pending: "secondary",
  on_it: "info",
  done: "success",
  issue: "error",
} as const;
const priorityVariant = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  urgent: "error",
} as const;

const emptyForm = {
  title: "",
  details: "",
  assignee_id: "",
  priority: "medium" as Priority,
  deadline: "",
  status: "pending" as TaskStatus,
};

const oldestFirst = (a: Task, b: Task) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [removing, setRemoving] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [form, setForm] = useState(emptyForm);
  const notify = (title: string) => toastManager.add({ title });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/tasks");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load tasks.");
      setTasks(data.tasks);
      setUsers(data.users);
    } catch (error) {
      const message = (error as Error).message;
      setLoadError(message);
      notify(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const visibleTasks = (
    filter === "all" ? tasks : tasks.filter((task) => task.status === filter)
  )
    .slice()
    .sort(oldestFirst);

  function openEditor(task: Task | "new") {
    setEditing(task);
    setForm(
      task === "new"
        ? { ...emptyForm, assignee_id: users[0]?.id || "" }
        : {
            title: task.title,
            details: task.details,
            assignee_id: task.assignee_id || users[0]?.id || "",
            priority: task.priority,
            deadline: task.deadline || "",
            status: task.status,
          },
    );
  }

  async function request(method: string, body: unknown) {
    const response = await fetch("/api/tasks", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Task update failed.");
    return data;
  }

  async function save() {
    if (!form.assignee_id) return notify("Choose an assignee.");
    setBusy(true);
    try {
      const data = await request(editing === "new" ? "POST" : "PATCH", {
        ...(editing !== "new" && editing ? { id: editing.id } : {}),
        ...form,
        deadline: form.deadline || null,
      });
      setTasks((current) =>
        [...current.filter((task) => task.id !== data.task.id), data.task].sort(
          oldestFirst,
        ),
      );
      setEditing(null);
      notify(editing === "new" ? "Task created." : "Task updated.");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(task: Task, status: TaskStatus) {
    const previous = task.status;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status } : item)),
    );
    try {
      const data = await request("PATCH", { id: task.id, status });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? data.task : item)),
      );
    } catch (error) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, status: previous } : item,
        ),
      );
      notify((error as Error).message);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await request("DELETE", { id: removing.id });
      setTasks((current) => current.filter((task) => task.id !== removing.id));
      setRemoving(null);
      notify("Task deleted.");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Tasks" className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign work, track deadlines, and keep everyone aligned.
          </p>
        </div>
        <Button
          size="sm"
          disabled={loading || !users.length}
          onClick={() => openEditor("new")}
        >
          Add task
        </Button>
      </div>

      <div className="mb-4 w-full sm:w-52">
        <Label htmlFor="task-status-filter" className="sr-only">
          Filter by status
        </Label>
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as TaskStatus | "all")}
        >
          <SelectTrigger id="task-status-filter" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All statuses · {tasks.length}</SelectItem>
            {statuses.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label} ·{" "}
                {tasks.filter((task) => task.status === item.value).length}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {loading ? (
        <div
          className="flex min-h-48 items-center justify-center"
          role="status"
        >
          <Spinner />
          <span className="sr-only">Loading tasks</span>
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/24 bg-destructive/4 p-4 text-sm text-destructive-foreground"
        >
          {loadError}
        </div>
      ) : visibleTasks.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assignee</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleTasks.map((task) => {
              const assignee = task.assignee_id
                ? userById.get(task.assignee_id)
                : undefined;
              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={assignee?.name || "Unassigned"}
                        src={assignee?.avatar_url}
                        size={30}
                      />
                      <div className="min-w-0">
                        <div>{assignee?.name || "Unassigned"}</div>
                        {assignee?.email && (
                          <div className="truncate text-xs text-muted-foreground">
                            {assignee.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <button
                      className="block w-full text-left"
                      onClick={() => openEditor(task)}
                    >
                      <span className="block font-medium">{task.title}</span>
                      {task.details && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {task.details}
                        </span>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant[task.priority]}>
                      {
                        priorities.find((item) => item.value === task.priority)
                          ?.label
                      }
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {task.deadline
                      ? new Date(
                          `${task.deadline}T00:00:00`,
                        ).toLocaleDateString()
                      : "No deadline"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={task.status}
                      onValueChange={(value) =>
                        void updateStatus(task, value as TaskStatus)
                      }
                    >
                      <SelectTrigger size="sm" className="min-w-28">
                        <SelectValue>
                          <Badge variant={badgeVariant[task.status]}>
                            {
                              statuses.find(
                                (item) => item.value === task.status,
                              )?.label
                            }
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {statuses.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => openEditor(task)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive-foreground"
                        onClick={() => setRemoving(task)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {filter === "all"
            ? "No tasks yet. Add the first task."
            : "No tasks with this status."}
        </div>
      )}

      {editing && (
        <Dialog
          open
          onOpenChange={(open) => !open && !busy && setEditing(null)}
        >
          <DialogPopup showCloseButton={false}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editing === "new" ? "Add task" : "Edit task"}
                </DialogTitle>
              </DialogHeader>
              <DialogPanel>
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="task-title">Task</Label>
                    <Input
                      id="task-title"
                      required
                      maxLength={160}
                      value={form.title}
                      onChange={(event) =>
                        setForm({ ...form, title: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="task-details">Details</Label>
                    <Textarea
                      id="task-details"
                      maxLength={5000}
                      rows={5}
                      value={form.details}
                      onChange={(event) =>
                        setForm({ ...form, details: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="task-assignee">Assignee</Label>
                      <Select
                        value={form.assignee_id}
                        onValueChange={(value) =>
                          setForm({ ...form, assignee_id: value as string })
                        }
                      >
                        <SelectTrigger id="task-assignee">
                          <SelectValue placeholder="Choose a user" />
                        </SelectTrigger>
                        <SelectPopup>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name} · {user.email}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="task-priority">Priority</Label>
                      <Select
                        value={form.priority}
                        onValueChange={(value) =>
                          setForm({ ...form, priority: value as Priority })
                        }
                      >
                        <SelectTrigger id="task-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          {priorities.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="task-deadline">Deadline</Label>
                      <Input
                        id="task-deadline"
                        nativeInput
                        type="date"
                        value={form.deadline}
                        onChange={(event) =>
                          setForm({ ...form, deadline: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="task-status">Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          setForm({ ...form, status: value as TaskStatus })
                        }
                      >
                        <SelectTrigger id="task-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          {statuses.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </div>
                  </div>
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button size="sm" type="submit" loading={busy}>
                  Save task
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>
      )}

      {removing && (
        <ConfirmDelete
          title="Delete task?"
          description={`This permanently deletes “${removing.title}” for everyone in the workspace.`}
          busy={busy}
          onClose={() => !busy && setRemoving(null)}
          onConfirm={() => void remove()}
        />
      )}
    </section>
  );
}
