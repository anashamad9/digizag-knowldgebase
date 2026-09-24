"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { BusinessRules } from "./business-rules";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTab } from "./ui/tabs";
import { Separator } from "./ui/separator";
import { VisibilitySelect } from "./visibility-select";
import { Icon } from "./icon";
import type { BrainState } from "@/hooks/use-brain";
import { Avatar } from "./avatar";
export function Settings({ brain: b }: { brain: BrainState }) {
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      b.setAvatarUrl(data.avatarUrl);
      b.notify("Profile image updated.");
    } catch (error) {
      b.notify((error as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not remove image.");
      b.setAvatarUrl(null);
      b.notify("Profile image removed.");
    } catch (error) {
      b.notify((error as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <section
      aria-label="Preferences"
      className="mx-auto w-full max-w-xl p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={b.name} src={b.avatarUrl} size={48} />
          <div className="min-w-0">
            <Label>Profile image</Label>
            <p className="truncate text-xs text-muted-foreground">{b.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {b.avatarUrl && (
            <Button
              size="xs"
              variant="ghost"
              disabled={avatarBusy}
              onClick={() => void removeAvatar()}
            >
              Remove
            </Button>
          )}
          <Button
            size="xs"
            variant="outline"
            loading={avatarBusy}
            onClick={() => avatarInput.current?.click()}
          >
            Upload
          </Button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => void uploadAvatar(event)}
          />
        </div>
      </div>
      <Separator />
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
      {
        <>
          <Separator />
          <div className="flex items-center justify-between gap-4 py-4">
            <span className="truncate text-xs text-muted-foreground">
              {b.email}
            </span>
            <Button
              size="xs"
              variant="destructive-outline"
              loading={b.signingOut}
              onClick={() => void b.signOut()}
            >
              Sign out
            </Button>
          </div>
        </>
      }
    </section>
  );
}
