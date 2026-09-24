import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserGroupIcon,
  AiBrain01Icon,
  Message01Icon,
  PlugSocketIcon,
  Database02Icon,
  Settings01Icon,
  Add01Icon,
  ArrowUp02Icon,
  ArrowUpRight01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Search01Icon,
  Sun03Icon,
  Moon02Icon,
  Attachment01Icon,
  Mail01Icon,
  Folder01Icon,
  File01Icon,
  Tick02Icon,
  MoreHorizontalIcon,
  SidebarLeft01Icon,
  RefreshIcon,
  Delete02Icon,
  Copy01Icon,
  LockKeyIcon,
  Logout01Icon,
  ArrowDown01Icon,
  InformationCircleIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
const icons = {
  users: UserGroupIcon,
  brain: AiBrain01Icon,
  chat: Message01Icon,
  apps: PlugSocketIcon,
  data: Database02Icon,
  settings: Settings01Icon,
  plus: Add01Icon,
  up: ArrowUp02Icon,
  diagonal: ArrowUpRight01Icon,
  arrow: ArrowRight01Icon,
  close: Cancel01Icon,
  search: Search01Icon,
  sun: Sun03Icon,
  moon: Moon02Icon,
  attach: Attachment01Icon,
  gmail: Mail01Icon,
  folder: Folder01Icon,
  file: File01Icon,
  check: Tick02Icon,
  more: MoreHorizontalIcon,
  sidebar: SidebarLeft01Icon,
  refresh: RefreshIcon,
  delete: Delete02Icon,
  copy: Copy01Icon,
  lock: LockKeyIcon,
  logout: Logout01Icon,
  down: ArrowDown01Icon,
  info: InformationCircleIcon,
  tasks: Task01Icon,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      strokeWidth={1.65}
      className={className}
    />
  );
}
