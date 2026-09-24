type AvatarMetadata = Record<string, unknown> | null | undefined;

export function avatarUrl(userId: string, metadata: AvatarMetadata) {
  const path = metadata?.avatar_path;
  if (typeof path !== "string" || !path.startsWith(`${userId}/profile/`))
    return null;
  const version = metadata?.avatar_version;
  const query = new URLSearchParams({ userId });
  if (typeof version === "string" || typeof version === "number")
    query.set("v", String(version));
  return `/api/profile/avatar?${query}`;
}
