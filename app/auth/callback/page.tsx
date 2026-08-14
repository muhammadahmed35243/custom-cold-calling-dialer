"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase handles the callback automatically
      // Just redirect to dashboard/dialer based on role
      const { data: { user } } = await supabaseAuth.auth.getUser();

      if (user?.email) {
        // Check role from agents table
        const { data: agent, error } = await supabaseClient
          .from("agents")
          .select("role")
          .eq("email", user.email)
          .single();

        if (agent) {
          if (agent.role === "admin") {
            router.push("/dashboard");
          } else {
            router.push("/dialer");
          }
        } else {
          // Email not authorized
          console.error("Agent not found for email:", user.email, "Error:", error);
          await supabaseAuth.auth.signOut();
          router.push("/auth/login?error=unauthorized");
        }
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Authenticating...</p>
      </div>
    </div>
  );
}
