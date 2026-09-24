import { BusinessRules } from "./business-rules";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTab } from "./ui/tabs";
import { Separator } from "./ui/separator";
import { VisibilitySelect } from "./visibility-select";
import { Icon } from "./icon";
import type { BrainState } from "@/hooks/use-brain";
export function Settings({ brain: b }: { brain: BrainState }) {
  return (
    <section
      aria-label="Preferences"
      className="mx-auto w-full max-w-xl p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4 py-3">
        <Label>Theme</Label>
        <Tabs
          value={b.dark ? "dark" : "light"}
          onValueChange={(v) => b.setDark(v === "dark")}
        >
          <TabsList size="sm">
            <TabsTab value="light">
              <Icon name="sun" size={14} />
              Light
            </TabsTab>
            <TabsTab value="dark">
              <Icon name="moon" size={14} />
              Dark
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-4 py-4">
        <Label htmlFor="learn">Learn from chats</Label>
        <Switch id="learn" checked={b.learn} onCheckedChange={b.setLearn} />
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-4 py-4">
        <Label>New memory visibility</Label>
        <div className="w-36">
          <VisibilitySelect
            value={b.visibility}
            onChange={b.setVisibility}
            label="New memory visibility"
          />
        </div>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-4 py-4">
        <Label>Model</Label>
        <span className="text-xs text-muted-foreground">GPT-5.6</span>
      </div>
      <Separator />
      <BusinessRules isOwner={b.isOwner} />
      <Separator />
      <div className="flex items-center justify-between gap-4 py-4">
        <span className="text-xs text-muted-foreground">Demo profile</span>
        <span className="truncate text-xs">{b.email}</span>
      </div>
    </section>
  );
}
