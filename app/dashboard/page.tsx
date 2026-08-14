"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default function DashboardSelector() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (!authUser?.email) {
        router.push("/auth/login");
        return;
      }

      const { data: agent } = await supabaseClient
        .from("agents")
        .select("role")
        .eq("email", authUser.email)
        .single();

      if (!agent || agent.role !== "admin") {
        router.push("/dialer");
        return;
      }

      setUser(authUser);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome, Admin!</h1>
            <p className="text-gray-600">{user?.email}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Admin Dashboard Card */}
            <button
              onClick={() => router.push("/admin")}
              className="group p-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl hover:shadow-lg transition transform hover:scale-105 text-left"
            >
              <div className="text-5xl mb-4">📊</div>
              <h2 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h2>
              <p className="text-blue-100 mb-4">
                Manage agents, view all calls, and track team performance
              </p>
              <div className="flex items-center text-white group-hover:translate-x-2 transition">
                <span className="font-semibold">Go to Admin</span>
                <span className="ml-2">→</span>
              </div>
            </button>

            {/* Dialer Card */}
            <button
              onClick={() => router.push("/dialer")}
              className="group p-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl hover:shadow-lg transition transform hover:scale-105 text-left"
            >
              <div className="text-5xl mb-4">📞</div>
              <h2 className="text-2xl font-bold text-white mb-2">Make Calls</h2>
              <p className="text-emerald-100 mb-4">
                Access the dialer and make calls to leads like an agent
              </p>
              <div className="flex items-center text-white group-hover:translate-x-2 transition">
                <span className="font-semibold">Go to Dialer</span>
                <span className="ml-2">→</span>
              </div>
            </button>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <button
              onClick={async () => {
                await supabaseAuth.auth.signOut();
                router.push("/auth/login");
              }}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
