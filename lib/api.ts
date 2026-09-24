import { serverDb, configured } from "@/lib/supabase/server";
import { ZodError } from "zod";
import { isAllowedOrigin } from "@/lib/request-origin";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function context() {
  if (!configured())
    throw new ApiError(
      "Connect Supabase in .env.local to enable the live workspace.",
      503,
    );
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new ApiError("Please sign in to continue.", 401);
  const { data: member, error } = await db
    .from("members")
    .select("workspace_id,role")
    .eq("user_id", user.id)
    .single();
  check(error);
  if (!member)
    throw new ApiError(
      "Your account needs a workspace invitation. Ask your administrator to add you.",
      403,
    );
  return {
    db,
    user,
    workspaceId: member.workspace_id as string,
    role: member.role as "owner" | "member",
  };
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Something went wrong. Please try again. If this continues, check your service configuration.",
    },
    { status: 500 },
  );
}
export function check(error: { message: string; code?: string } | null) {
  if (error?.code === "PGRST205" || error?.code === "42703")
    throw new ApiError(
      "Database upgrade required. Run supabase/upgrade.sql in the connected Supabase project.",
      503,
    );
  if (error?.code === "42501")
    throw new ApiError(
      "Database access denied. Check membership, database policies, and the server service-role key.",
      403,
    );
  if (error) throw new Error(error.message);
}
export function sameOrigin(request: Request) {
  if (
    !isAllowedOrigin(
      request,
      process.env.APP_URL,
      process.env.NODE_ENV === "development",
    )
  )
    throw new ApiError("Invalid request origin.", 403);
}
