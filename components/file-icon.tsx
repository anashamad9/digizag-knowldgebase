import { HugeiconsIcon } from "@hugeicons/react";
import {
  Pdf02Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileImageIcon,
  FileVideoIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileZipIcon,
  File01Icon,
} from "@hugeicons/core-free-icons";
export function FileIcon({ name, size = 16 }: { name: string; size?: number }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const [icon, color] =
    ext === "pdf"
      ? [Pdf02Icon, "text-red-500"]
      : ["xls", "xlsx", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(ext)
        ? [FileSpreadsheetIcon, "text-emerald-500"]
        : ["doc", "docx", "txt", "md", "rtf"].includes(ext)
          ? [FileTextIcon, "text-blue-500"]
          : ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)
            ? [FileImageIcon, "text-violet-500"]
            : ["mp4", "mov", "webm"].includes(ext)
              ? [FileVideoIcon, "text-pink-500"]
              : ["mp3", "wav", "m4a", "ogg"].includes(ext)
                ? [FileAudioIcon, "text-amber-500"]
                : ["zip", "rar", "7z", "gz", "tar"].includes(ext)
                  ? [FileZipIcon, "text-amber-500"]
                  : [
                        "json",
                        "xml",
                        "html",
                        "css",
                        "js",
                        "ts",
                        "py",
                        "sql",
                      ].includes(ext)
                    ? [FileCodeIcon, "text-cyan-500"]
                    : [File01Icon, "text-muted-foreground"];
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      className={color}
      aria-label={`${ext || "Unknown"} file`}
    />
  );
}
