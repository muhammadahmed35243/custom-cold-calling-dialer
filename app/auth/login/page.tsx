"use client";

import { supabaseAuth } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if already logged in
    const checkAuth = async () => {
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user) {
        router.push("/dashboard");
      }
    };
    checkAuth();
  }, [router]);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Cold Dialer</h1>
          <p className="text-gray-600">Sign in to access the dialer</p>
        </div>

        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700">
              <strong>⚠️ Privacy Notice:</strong> Your calls will be recorded for quality assurance and training purposes.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.449-.356 4.68-1.494 6.203-1.019 1.324-2.523 1.899-4.14 1.899-2.112 0-3.965-1.589-3.965-3.667 0-1.335.582-2.458 1.679-3.282.551-.643 1.31-1.571 2.157-2.692.849-1.12 1.564-1.845 2.139-2.187 1.111-.656 2.157-.656 3.028 0 .75.434 1.393 1.148 1.878 2.266.473-.575.803-1.159.994-1.767.16-.448.243-.896.243-1.343 0-.67-.106-1.315-.328-1.934a2.678 2.678 0 0 0-.7-1.229 2.678 2.678 0 0 0-1.229-.7 2.678 2.678 0 0 0-1.934.328 5.356 5.356 0 0 0-1.526 1.09 10.712 10.712 0 0 0-1.526 1.9 15.068 15.068 0 0 0-1.228 2.474 19.424 19.424 0 0 0-.75 3.198 23.78 23.78 0 0 0-.2 4.078c0 1.67.114 3.254.328 4.73a29.136 29.136 0 0 0 1.074 4.76" />
          </svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Only authorized agents can access this application.
          </p>
        </div>
      </div>
    </div>
  );
}
