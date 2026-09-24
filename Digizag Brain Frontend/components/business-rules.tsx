"use client";

import { useState } from "react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

const starterRules =
  "Use ‘customer’ instead of ‘client’. Product announcements require approval from the product lead. The launch plan is the source of truth for release dates.";

export function BusinessRules({ isOwner }: { isOwner: boolean }) {
  const [content, setContent] = useState(starterRules);
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-2 py-4">
      <Label htmlFor="business-rules">Business rules</Label>
      <Textarea
        id="business-rules"
        size="sm"
        rows={4}
        readOnly={!isOwner}
        value={content}
        maxLength={12000}
        onChange={(event) => {
          setContent(event.target.value);
          setSaved(false);
        }}
        placeholder="Terminology, known aliases, approval rules, and authoritative sources."
      />
      <p className="text-xs text-muted-foreground">
        Stored only in this page session. No server or database is connected.
      </p>
      {isOwner && (
        <Button
          size="xs"
          variant="outline"
          className="self-end"
          onClick={() => setSaved(true)}
        >
          {saved ? "Saved locally" : "Save rules"}
        </Button>
      )}
    </div>
  );
}
