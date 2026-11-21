import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset Password — Kalexi Brokerage" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [linkReady, setLinkReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    async function verifyRecoverySession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (active) setLinkReady(Boolean(data.session));
      } catch (verificationError) {
        console.error("[Kalexi password reset link verification failed]", verificationError);
        if (active) setError("This reset link is invalid or has expired. Request a new link.");
      } finally {
        if (active) setCheckingLink(false);
      }
    }

    void verifyRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setComplete(true);
      toast.success("Your password has been updated.");
    } catch (resetError) {
      console.error("[Kalexi password update failed]", resetError);
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Password could not be updated. Request a new reset link and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <KalexiMark className="h-10 w-10" />
          <div>
            <p className="font-display font-semibold">KALEXI BROKERAGE LTD</p>
            <p className="text-sm text-muted-foreground">Secure password reset</p>
          </div>
        </div>

        {complete ? (
          <div className="space-y-4">
            <h1 className="font-display text-xl font-semibold">Password updated</h1>
            <p className="text-sm text-muted-foreground">
              Your password was changed. Sign in with your new password to continue.
            </p>
            <Button asChild className="w-full">
              <Link to="/">Return to sign in</Link>
            </Button>
          </div>
        ) : checkingLink ? (
          <p role="status" className="text-sm text-muted-foreground">
            Verifying your reset link…
          </p>
        ) : !linkReady ? (
          <div className="space-y-4">
            <h1 className="font-display text-xl font-semibold">Reset link unavailable</h1>
            <p role="alert" className="text-sm text-destructive">
              {error ?? "This reset link is invalid or has expired. Request a new link."}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Return to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h1 className="font-display text-xl font-semibold">Choose a new password</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Use at least 12 characters to protect your account.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  className="pr-10"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={12}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Updating password…" : "Update password"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
