"use client";
import { PumbleContent } from "./pumble-content";
import { EmailContent } from "./email-content";
import { Badge } from "./ui/badge";
import { useState } from "react";
import type { Memory } from "@/lib/types";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { VisibilitySelect } from "./visibility-select";
export function MemoryDialog({
  busy = false,
  readOnly = false,
  memory,
  onChange,
  onClose,
  onSave,
  onRemove,
}: {
  busy?: boolean;
  readOnly?: boolean;
  memory: Memory;
  onChange: (value: Memory) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(
    memory.source !== "gmail" && memory.source !== "pumble",
  );
  const [versions, setVersions] = useState(false);
  const [source, setSource] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup closeProps={{ "aria-label": "Close memory" }}>
        <DialogHeader>
          <DialogTitle>
            {memory.source === "gmail"
              ? "Email"
              : memory.source === "pumble"
                ? "Pumble message"
                : "Memory"}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            {!editing && memory.source === "gmail" ? (
              <EmailContent memory={memory} />
            ) : !editing && memory.source === "pumble" ? (
              <PumbleContent memory={memory} />
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="memory-title">Title</Label>
                  <Input
                    readOnly={readOnly || busy}
                    id="memory-title"
                    size="sm"
                    value={memory.title}
                    onChange={(e) =>
                      onChange({ ...memory, title: e.target.value })
                    }
                    maxLength={200}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="memory-content">Content</Label>
                  <Textarea
                    readOnly={readOnly || busy}
                    id="memory-content"
                    size="sm"
                    value={memory.content}
                    onChange={(e) =>
                      onChange({ ...memory, content: e.target.value })
                    }
                    rows={6}
                    maxLength={
                      memory.source === "gmail" || memory.source === "pumble"
                        ? undefined
                        : 120000
                    }
                  />
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <Label>Visibility</Label>
              <div className="w-36">
                {readOnly ? (
                  <Badge
                    variant={
                      memory.visibility === "workspace" ? "info" : "warning"
                    }
                  >
                    {memory.visibility === "workspace" ? "Team" : "Only me"}
                  </Badge>
                ) : (
                  <VisibilitySelect
                    value={memory.visibility}
                    onChange={(visibility) =>
                      onChange({ ...memory, visibility })
                    }
                    label="Memory visibility"
                  />
                )}
              </div>
            </div>
            {!!memory.revisions?.length && (
              <div>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-expanded={versions}
                  onClick={() => setVersions(!versions)}
                >
                  Previous versions
                </Button>
                {versions && (
                  <div className="mt-2 flex max-h-60 flex-col gap-4 overflow-auto">
                    {memory.revisions.map((r) => (
                      <div key={r.id} className="border-l pl-3 text-xs">
                        <p className="mb-1 text-muted-foreground">
                          Replaced {new Date(r.replaced_at).toLocaleString()}
                        </p>
                        <p className="font-medium">{r.title}</p>
                        <p className="whitespace-pre-wrap break-words">
                          {r.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {Object.keys(memory.metadata).length > 0 && (
              <div>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-expanded={source}
                  onClick={() => setSource(!source)}
                >
                  Source details
                </Button>
                {source && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                    {JSON.stringify(memory.metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </DialogPanel>
        {!readOnly && (
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive-foreground sm:mr-auto"
              disabled={busy}
              loading={busy}
              onClick={onRemove}
            >
              Remove
            </Button>
            {(memory.source === "gmail" || memory.source === "pumble") && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Preview" : "Edit text"}
              </Button>
            )}
            <Button size="sm" loading={busy} onClick={onSave}>
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogPopup>
    </Dialog>
  );
}
