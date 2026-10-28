import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  lookupLoginIdentity,
  recordSignIn,
  signInWithPhone,
  type LoginIdentity,
} from "@/lib/auth.functions";
import { greeting } from "@/lib/rbac";
import { APP_VERSION_DISPLAY } from "@/lib/app-version";
import { useRefreshSession } from "@/hooks/useSession";
import { KalexiMark } from "@/components/KalexiMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignInBackdrop } from "@/components/SignInBackdrop";
import { OperationProgress } from "@/components/LoadingStates";

const BOOTSTRAP_EMAIL = "kalemireabdul09@gmail.com";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kalexi Brokerage Ltd — Secure Staff Sign In" },
      {
        name: "description",
        content:
          "Secure staff access to the Kalexi Brokerage Ltd brokerage management, intelligence and operations system.",
      },
      { property: "og:title", content: "Kalexi Brokerage Ltd — Secure Staff Sign In" },
      {
        property: "og:description",
        content: "Internal brokerage management, intelligence and operations platform.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignInPage,
});

type Step = "email" | "password" | "activate";
type LoginMethod = "email" | "phone";

function SignInPage() {
  const navigate = useNavigate();
  const refreshSession = useRefreshSession();
  const lookup = useServerFn(lookupLoginIdentity);
  const markSignIn = useServerFn(recordSignIn);
  const phoneSignIn = useServerFn(signInWithPhone);

  const [step, setStep] = useState<Step>("email");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [identity, setIdentity] = useState<LoginIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await lookup({ data: { identifier } });
      if (result) {
        setIdentity(result);
        setStep("password");
      } else if (identifier.trim().toLowerCase() === BOOTSTRAP_EMAIL) {
        setStep("activate");
      } else {
        setError("Account not found or not authorized.");
      }
    } catch (err) {
      console.error("[Kalexi login identity lookup failed]", err);
      setError(
        err instanceof Error && err.message !== "Unable to verify this account right now."
          ? err.message
          : "Unable to verify this account right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function landingRoute() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return "/dashboard";
    const { data: ag } = await supabase
      .from("agents")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();
    if (ag) return "/agent-portal";
    const { data: ap } = await supabase
      .from("agent_applications")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();
    if (ap) return "/agent-portal";
    return "/dashboard";
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (loginMethod === "email") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { session } = await phoneSignIn({
          data: { phone: identifier.trim(), password },
        });
        const { error: sessionError } = await supabase.auth.setSession(session);
        if (sessionError) throw sessionError;
      }
    } catch (signInError) {
      console.error("[Kalexi password sign-in failed]", signInError);
      setBusy(false);
      setError("Incorrect password or sign-in details. Please try again.");
      return;
    }
    try {
      await markSignIn();
    } catch (error) {
      console.error("[Kalexi login activity could not be recorded]", error);
    }
    await refreshSession();
    await navigate({ to: await landingRoute(), replace: true });
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Use at least 12 characters for the Super Admin password.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: identifier.trim(),
        password,
        options: { data: { full_name: "Kalemire Abdulrahuman" } },
      });
      if (signUpError) throw signUpError;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: identifier.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch (activationError) {
      console.error("[Kalexi Super Admin activation failed]", activationError);
      setBusy(false);
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Account activation failed. Please try again.",
      );
      return;
    }
    try {
      await markSignIn();
    } catch (error) {
      console.error("[Kalexi login activity could not be recorded]", error);
    }
    await refreshSession();
    toast.success("Super Admin account activated.");
    await navigate({ to: await landingRoute(), replace: true });
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-navy text-navy-foreground">
      <SignInBackdrop />
      <header className="relative flex items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <p className="text-xs font-medium text-navy-foreground/65">
          KALEXI <span className="font-normal">/ SECURE ACCESS</span>
        </p>
        <span className="flex items-center gap-2 text-xs text-navy-foreground/65">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          Brokerage operations
        </span>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <KalexiMark className="mx-auto mb-4 h-14 w-14" />
            <h1 className="font-display text-2xl font-semibold">Welcome to Kalexi</h1>
            <p className="mt-2 text-sm text-navy-foreground/75">
              Brokerage Management &amp; Operations
            </p>
          </div>
          <div className="signin-panel rounded-lg p-5 sm:p-6">
            {busy ? (
              <div className="mb-4">
                <OperationProgress
                  className="border-white/20 bg-black/20 text-navy-foreground"
                  message={
                    step === "email"
                      ? "Verifying your account…"
                      : step === "password"
                        ? "Verifying your sign-in details…"
                        : "Activating your account…"
                  }
                />
              </div>
            ) : null}
            {step === "email" && (
              <form onSubmit={submitEmail} className="space-y-5">
                <div>
                  <p className="text-xs font-medium uppercase text-gold">
                    Staff &amp; agent sign-in
                  </p>
                  <h2 className="mt-1 font-display text-lg font-semibold">Your workspace awaits</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose how you want to sign in.
                  </p>
                </div>
                <div
                  aria-label="Sign-in method"
                  className="grid grid-cols-2 rounded-md border border-white/15 bg-black/10 p-1"
                  role="tablist"
                >
                  {(
                    [
                      ["email", "Email"],
                      ["phone", "Phone number"],
                    ] as const
                  ).map(([method, label]) => (
                    <button
                      key={method}
                      type="button"
                      role="tab"
                      aria-selected={loginMethod === method}
                      className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                        loginMethod === method
                          ? "bg-gold text-gold-foreground"
                          : "text-navy-foreground/75 hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setLoginMethod(method);
                        setIdentifier("");
                        setIdentity(null);
                        setError(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-identifier">
                    {loginMethod === "email" ? "Email address" : "Phone number"}
                  </Label>
                  <Input
                    id="login-identifier"
                    type={loginMethod === "email" ? "email" : "tel"}
                    autoComplete="username"
                    required
                    maxLength={255}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={loginMethod === "email" ? "name@kalexi.co" : "+256 700 000000"}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button
                  type="submit"
                  className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
                  disabled={busy}
                >
                  {busy ? "Checking…" : "Continue"}
                </Button>
              </form>
            )}

            {step === "password" && (
              <form onSubmit={submitPassword} className="space-y-5">
                {identity ? (
                  <div className="rounded-lg border bg-card p-4 shadow-[var(--shadow-panel)]">
                    <div className="flex items-center gap-4">
                      {identity.photoUrl ? (
                        <img
                          src={identity.photoUrl}
                          alt={identity.fullName}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy text-lg font-semibold text-gold">
                          {identity.fullName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">
                          {greeting()}, {identity.fullName.split(" ")[0]}.
                        </p>
                        <p className="truncate font-display font-semibold">{identity.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {identity.jobTitle ?? "Kalexi staff"}
                          {identity.department ? ` · ${identity.department}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="label-caps">Phone sign-in</p>
                    <h2 className="mt-1 font-display text-lg font-semibold">Enter your password</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Use the password for the phone number you entered.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Authenticating…" : "Open my workspace"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStep("email");
                    setPassword("");
                    setError(null);
                  }}
                >
                  Use a different account
                </Button>
              </form>
            )}

            {step === "activate" && (
              <form onSubmit={activate} className="space-y-5">
                <div>
                  <p className="label-caps">First-time activation</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold">
                    Create your Super Admin password
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This account has not been activated yet. Choose a strong password of at least 12
                    characters. It is stored only as a secure hash.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newpw">New password</Label>
                  <Input
                    id="newpw"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmpw">Confirm password</Label>
                  <Input
                    id="confirmpw"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Activating…" : "Activate account"}
                </Button>
              </form>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-navy-foreground/65">
            Need account access? Contact your Kalexi administrator.
          </p>
        </div>
      </main>
      <footer className="relative px-5 pb-6 text-center text-xs text-navy-foreground/60">
        <p className="font-medium text-navy-foreground/85">KALEXI BROKERAGE LTD</p>
        <p className="mt-1">Authorised staff and digital agents only</p>
        <p className="mt-1">{APP_VERSION_DISPLAY}</p>
      </footer>
    </div>
  );
}
