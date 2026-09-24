"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { browserDb } from "@/lib/supabase/client";
export function AccessState({
  message,
  signOut = false,
}: {
  message: string;
  signOut?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <h1 className="wordmark text-3xl">Brain</h1>
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        {error || message}
      </p>
      {signOut && (
        <Button
          size="sm"
          variant="outline"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await browserDb().auth.signOut();
              if (error) throw error;
              router.replace("/login");
              router.refresh();
            } catch {
              setError("Could not sign out. Try again.");
              setBusy(false);
            }
          }}
        >
          Sign out
        </Button>
      )}
    </main>
  );
}
