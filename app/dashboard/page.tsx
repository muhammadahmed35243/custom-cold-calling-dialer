"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";
import { JetztLogo } from "@/components/Logo";
import { useAppReady } from "@/components/AppReadyContext";
import { BrandedLoader } from "@/components/BrandedLoader";

export const dynamic = "force-dynamic";

export default function DashboardSelector() {
  const router = useRouter();
  const { setReady } = useAppReady();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (!authUser?.email) {
        router.push("/auth/login");
        setReady();
        return;
      }

      const { data: agent } = await supabaseClient
        .from("agents")
        .select("role")
        .eq("email", authUser.email)
        .single();

      if (!agent || agent.role !== "admin") {
        router.push("/dialer");
        setReady();
        return;
      }

      setUser(authUser);
      setLoading(false);
      setReady();
    };

    checkAuth();
  }, [router, setReady]);

  if (loading) {
    return <BrandedLoader />;
  }

  return (
    <div className="min-h-screen bg-background dotted-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-card border border-border rounded-2xl shadow-sm p-8 md:p-12">
          <div className="text-center mb-10">
            <JetztLogo className="h-8 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">Welcome, Admin</h1>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Admin Dashboard Card */}
            <button
              onClick={() => router.push("/admin")}
              className="group p-6 bg-card border border-border rounded-xl hover:border-foreground/20 hover:shadow-sm transition-all text-left"
            >
              <h2 className="text-lg font-semibold text-foreground mb-1.5">Admin Dashboard</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Manage agents, view all calls, and track team performance
              </p>
              <div className="flex items-center text-foreground text-sm font-medium group-hover:translate-x-1 transition-transform">
                <span>Go to Admin</span>
                <span className="ml-1.5">→</span>
              </div>
            </button>

            {/* Dialer Card */}
            <button
              onClick={() => router.push("/dialer")}
              className="group p-6 bg-primary border border-primary rounded-xl hover:bg-primary/90 hover:shadow-sm transition-all text-left"
            >
              <h2 className="text-lg font-semibold text-primary-foreground mb-1.5">Make Calls</h2>
              <p className="text-sm text-primary-foreground/70 mb-5">
                Access the dialer and make calls to leads like an agent
              </p>
              <div className="flex items-center text-primary-foreground text-sm font-medium group-hover:translate-x-1 transition-transform">
                <span>Go to Dialer</span>
                <span className="ml-1.5">→</span>
              </div>
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <button
              onClick={async () => {
                await supabaseAuth.auth.signOut();
                router.push("/auth/login");
              }}
              className="w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
