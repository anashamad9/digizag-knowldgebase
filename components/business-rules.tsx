"use client";
import { useEffect, useState } from "react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Spinner } from "./ui/spinner";
export function BusinessRules({ isOwner }: { isOwner: boolean }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/knowledge-rules")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!cancelled) setContent(d.content);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const r = await fetch("/api/knowledge-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 py-4">
      <Label htmlFor="business-rules">
        Business rules {loading && <Spinner />}
      </Label>
      <Textarea
        id="business-rules"
        size="sm"
        rows={4}
        readOnly={!isOwner}
        disabled={loading || saving}
        value={content}
        maxLength={12000}
        onChange={(e) => {
          setContent(e.target.value);
          setSaved(false);
        }}
        placeholder="Terminology, known aliases, approval rules, and authoritative sources. Leave blank when unknown."
      />
      <p className="text-xs text-muted-foreground">
        Shared with your workspace. Source messages cannot change these rules.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      )}
      {isOwner && (
        <Button
          size="xs"
          variant="outline"
          className="self-end"
          disabled={loading}
          loading={saving}
          onClick={() => void save()}
        >
          {saved ? "Saved" : "Save rules"}
        </Button>
      )}
    </div>
  );
}
