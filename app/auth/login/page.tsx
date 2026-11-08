"use client";

import { supabaseAuth } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { useAppReady } from "@/components/AppReadyContext";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const { setReady } = useAppReady();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The form itself renders immediately, with no loading gate -- ready as
    // soon as this mounts, independent of the background already-logged-in
    // check below.
    setReady();

    // Check if already logged in
    const checkAuth = async () => {
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user) {
        router.push("/dashboard");
      }
    };
    checkAuth();
  }, [router, setReady]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const { error } = await supabaseAuth.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background dotted-bg px-4 py-10 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl"
      />
      <div className="relative bg-card border border-border rounded-2xl shadow-lift p-6 sm:p-8 max-w-md w-full">
        <div className="mb-8">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to open your dialer.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Neutral white button, as Google's sign-in guidelines ask, rather
            than the brand yellow. */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="btn btn-secondary btn-lg w-full gap-2.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>

        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Only authorized agents can access this application.
          </p>
        </div>
      </div>
    </div>
  );
}
