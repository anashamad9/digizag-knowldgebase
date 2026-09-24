export type SkippedChannel = { channelId: string; channelName: string };
export function skipChannel<T extends SkippedChannel>(
  tasks: T[],
  skipped: SkippedChannel[],
  channel: SkippedChannel,
) {
  return {
    tasks: tasks.filter((task) => task.channelId !== channel.channelId),
    skippedChannels: skipped.some(
      (item) => item.channelId === channel.channelId,
    )
      ? skipped
      : [
          ...skipped,
          { channelId: channel.channelId, channelName: channel.channelName },
        ],
  };
}
export function channelAccessWarning(skipped: SkippedChannel[] = []) {
  if (!skipped.length) return null;
  const names = skipped
    .slice(0, 3)
    .map((c) => `#${c.channelName}`)
    .join(", ");
  return `Skipped ${names}${skipped.length > 3 ? ` and ${skipped.length - 3} more channels` : ""}: Pumble denied access. Private channels require the API add-on bot as a member. Check channel access, then select Sync to retry.`;
}
