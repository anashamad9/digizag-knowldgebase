import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "./ui/select";
export function VisibilitySelect({
  value,
  onChange,
  label = "Visibility",
}: {
  value: "private" | "workspace";
  onChange: (value: "private" | "workspace") => void;
  label?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === "private" || v === "workspace") onChange(v);
      }}
      items={{ private: "Only me", workspace: "Team" }}
    >
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        <SelectItem value="private">Only me</SelectItem>
        <SelectItem value="workspace">Team</SelectItem>
      </SelectPopup>
    </Select>
  );
}
