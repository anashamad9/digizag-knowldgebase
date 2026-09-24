"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form
        className="flex w-full max-w-xs flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const { error } = await browserDb().auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (error) {
              setError(
                error.code === "email_not_confirmed"
                  ? "Ask your administrator to confirm your account in Supabase."
                  : "Could not sign in. Check your email and password.",
              );
              setBusy(false);
              return;
            }
            setPassword("");
            router.replace("/");
            router.refresh();
          } catch {
            setError("Could not connect. Please try again.");
            setBusy(false);
          }
        }}
      >
        <h1 className="wordmark text-3xl">Brain</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            size="sm"
            type="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="you@company.com"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            size="sm"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          loading={busy}
          disabled={!email.trim() || !password}
        >
          Sign in
        </Button>
        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>
    </main>
  );
}
