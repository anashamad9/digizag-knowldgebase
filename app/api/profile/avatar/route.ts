import { z } from "zod";
import { avatarUrl } from "@/lib/avatar";
import { ApiError, check, context, failure, sameOrigin } from "@/lib/api";
import { adminDb } from "@/lib/supabase/server";

const accepted = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

function validImage(bytes: Uint8Array, type: keyof typeof accepted) {
  if (type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  if (type === "image/webp")
    return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  return header.startsWith("GIF87a") || header.startsWith("GIF89a");
}

function ownedAvatarPath(value: unknown, userId: string): value is string {
  return typeof value === "string" && value.startsWith(`${userId}/profile/`);
}

export async function GET(request: Request) {
  try {
    const { user, workspaceId } = await context();
    const targetId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("userId") || user.id);
    const admin = adminDb();
    if (targetId !== user.id) {
      const member = await admin
        .from("members")
        .select("user_id")
        .eq("user_id", targetId)
        .eq("workspace_id", workspaceId)
        .eq("disabled", false)
        .maybeSingle();
      check(member.error);
      if (!member.data) throw new ApiError("Profile image not found.", 404);
    }
    const account = await admin.auth.admin.getUserById(targetId);
    check(account.error);
    const path = account.data.user?.user_metadata.avatar_path;
    if (!ownedAvatarPath(path, targetId))
      throw new ApiError("Profile image not found.", 404);
    const stored = await admin.storage.from("knowledge").download(path);
    check(stored.error);
    if (!stored.data) throw new ApiError("Profile image not found.", 404);
    const blob = stored.data;
    return new Response(await blob.arrayBuffer(), {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await context();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("Choose an image.");
    if (!file.size || file.size > 2_000_000)
      throw new ApiError("Profile images must be smaller than 2 MB.");
    if (!(file.type in accepted))
      throw new ApiError("Use a JPG, PNG, WebP, or GIF image.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = file.type as keyof typeof accepted;
    if (!validImage(bytes, type))
      throw new ApiError("The image file is invalid.");

    const admin = adminDb();
    const old = await admin.auth.admin.getUserById(user.id);
    check(old.error);
    const version = Date.now();
    const path = `${user.id}/profile/${crypto.randomUUID()}.${accepted[type]}`;
    const upload = await admin.storage.from("knowledge").upload(path, bytes, {
      contentType: type,
      upsert: false,
    });
    check(upload.error);
    const metadata = {
      ...old.data.user?.user_metadata,
      avatar_path: path,
      avatar_version: version,
    };
    const update = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: metadata,
    });
    if (update.error) {
      await admin.storage.from("knowledge").remove([path]);
      check(update.error);
    }
    const previous = old.data.user?.user_metadata.avatar_path;
    if (ownedAvatarPath(previous, user.id))
      await admin.storage.from("knowledge").remove([previous]);
    return Response.json({ avatarUrl: avatarUrl(user.id, metadata) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await context();
    const admin = adminDb();
    const account = await admin.auth.admin.getUserById(user.id);
    check(account.error);
    const path = account.data.user?.user_metadata.avatar_path;
    const update = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...account.data.user?.user_metadata,
        avatar_path: null,
        avatar_version: null,
      },
    });
    check(update.error);
    if (ownedAvatarPath(path, user.id))
      check((await admin.storage.from("knowledge").remove([path])).error);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
