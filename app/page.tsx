"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase";
import { useAppReady } from "@/components/AppReadyContext";
import { BrandedLoader } from "@/components/BrandedLoader";

export const dynamic = "force-dynamic";

export default function Home() {
  const router = useRouter();
  const { setReady } = useAppReady();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user?.email) {
        router.push("/dashboard");
      } else {
        router.push("/auth/login");
      }
      setReady();
    };

    checkAuth();
  }, [router, setReady]);

  return <BrandedLoader />;
}
