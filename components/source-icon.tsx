import Image from "next/image";
import type { Source } from "@/lib/types";
import { Icon } from "./icon";

export function SourceIcon({
  source,
  size = 16,
}: {
  source: Source;
  size?: number;
}) {
  if (source === "gmail" || source === "pumble")
    return (
      <Image
        src={`/logos/${source === "gmail" ? "gmail.png" : "pumble.svg"}`}
        width={size}
        height={size}
        alt=""
        className="shrink-0 object-contain"
      />
    );
  return <Icon name={source === "note" ? "brain" : "file"} size={size} />;
}
