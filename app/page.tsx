"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user?.email) {
        router.push("/dashboard");
      } else {
        router.push("/auth/login");
      }
    };

    checkAuth();
  }, [router]);

  return <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">Loading...</div>;
}
