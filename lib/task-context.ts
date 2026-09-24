import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./api";
import { adminDb } from "./supabase/server";

export const taskStatuses = ["pending", "on_it", "done", "issue"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

const statusPatterns: Record<TaskStatus, RegExp> = {
  pending: /\bpending\b/i,
  on_it: /\b(on[ -]?it|in[ -]?progress|working on)\b/i,
  done: /\b(done|completed|finished)\b/i,
  issue: /\b(issue|issues|blocked|problem)\b/i,
};

export function taskStatusLimits(question: string) {
  const requested = taskStatuses.filter((status) =>
    statusPatterns[status].test(question),
  );
  return Object.fromEntries(
    taskStatuses.map((status) => [
      status,
      requested.length === 0 ? 25 : requested.includes(status) ? 100 : 5,
    ]),
  ) as Record<TaskStatus, number>;
}

export async function taskContext(
  db: SupabaseClient,
  workspaceId: string,
  question: string,
) {
  const limits = taskStatusLimits(question);
  const results = await Promise.all(
    taskStatuses.map(async (taskStatus) => {
      const result = await db
        .from("tasks")
        .select(
          "id,title,details,assignee_id,creator_id,priority,deadline,status,created_at,updated_at",
          { count: "exact" },
        )
        .eq("workspace_id", workspaceId)
        .eq("status", taskStatus)
        .order("deadline", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limits[taskStatus]);
      return { taskStatus, ...result };
    }),
  );
  const missing = results.find((result) => result.error?.code === "PGRST205");
  if (missing)
    return {
      available: false,
      reason:
        "Task storage is not installed. Run supabase/upgrade.sql in the connected Supabase project.",
    };
  for (const result of results) check(result.error);

  const assigneeIds = [
    ...new Set(
      results.flatMap((result) =>
        (result.data ?? []).flatMap((task) =>
          task.assignee_id ? [task.assignee_id] : [],
        ),
      ),
    ),
  ];
  const people = new Map<string, { id: string; name: string; email: string }>();
  await Promise.all(
    assigneeIds.map(async (id) => {
      const result = await adminDb().auth.admin.getUserById(id);
      if (result.error || !result.data.user) return;
      const user = result.data.user;
      people.set(id, {
        id,
        name:
          user.user_metadata.full_name ||
          user.user_metadata.name ||
          user.email?.split("@")[0] ||
          "User",
        email: user.email || "",
      });
    }),
  );

  return {
    available: true,
    as_of: new Date().toISOString(),
    status_counts: Object.fromEntries(
      results.map((result) => [result.taskStatus, result.count ?? 0]),
    ),
    records: results.flatMap((result) =>
      (result.data ?? []).map((task) => ({
        ...task,
        details: task.details.slice(0, 1000),
        assignee: task.assignee_id
          ? (people.get(task.assignee_id) ?? {
              id: task.assignee_id,
              name: "Former or unavailable user",
              email: "",
            })
          : null,
      })),
    ),
    coverage: Object.fromEntries(
      results.map((result) => [
        result.taskStatus,
        {
          returned: result.data?.length ?? 0,
          total: result.count ?? 0,
          truncated: (result.count ?? 0) > (result.data?.length ?? 0),
        },
      ]),
    ),
  };
}
