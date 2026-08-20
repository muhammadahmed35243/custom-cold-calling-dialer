"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";
import type { Agent, Call } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tab, setTab] = useState<"calls" | "agents">("calls");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (!authUser?.email) {
        router.push("/auth/login");
        return;
      }

      // Check if admin
      const { data: agent } = await supabaseClient
        .from("agents")
        .select("*")
        .eq("email", authUser.email)
        .single();

      if (!agent || agent.role !== "admin") {
        router.push("/dialer");
        return;
      }

      setUser(authUser);

      // Load all calls
      const { data: callsData } = await supabaseClient
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false });

      setCalls(callsData || []);

      // Load all agents
      const { data: agentsData } = await supabaseClient
        .from("agents")
        .select("*")
        .order("created_at", { ascending: false });

      setAgents(agentsData || []);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleSignOut = async () => {
    await supabaseAuth.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Logo product="Admin" />
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Dashboard
            </button>
            <button
              onClick={() => router.push("/mail")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Mail
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setTab("calls")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "calls"
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            All Calls ({calls.length})
          </button>
          <button
            onClick={() => setTab("agents")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "agents"
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            Manage Agents ({agents.length})
          </button>
        </div>

        {tab === "calls" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Lead</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Disposition</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Recording</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-foreground">{call.agent_email}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{call.lead_id.slice(0, 8)}</td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {call.duration_seconds ? `${call.duration_seconds}s` : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          call.disposition === "connected"
                            ? "bg-accent-green/15 text-accent-green-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {call.disposition || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {call.recording_url ? (
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground underline underline-offset-2 hover:no-underline"
                        >
                          Listen
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(call.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "agents" && <AgentManagement agents={agents} onRefresh={() => window.location.reload()} />}
      </main>
    </div>
  );
}

function AgentManagement({
  agents,
  onRefresh,
}: {
  agents: Agent[];
  onRefresh: () => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  const authedFetch = async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) throw new Error("Session expired, please login again");
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });
  };

  const handleToggleActive = async (agent: Agent) => {
    setBusyAgentId(agent.id);
    try {
      const response = await authedFetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !agent.is_active }),
      });
      if (response.ok) onRefresh();
      else setError((await response.json()).error || "Failed to update agent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setBusyAgentId(null);
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (!window.confirm(`Delete ${agent.display_name} (${agent.email})? This cannot be undone.`)) return;

    setBusyAgentId(agent.id);
    try {
      const response = await authedFetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      if (response.ok) onRefresh();
      else setError((await response.json()).error || "Failed to delete agent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setBusyAgentId(null);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabaseClient
        .from("agents")
        .insert([
          {
            email: newEmail,
            display_name: newName,
            phone_number: newPhone,
            alias_email: newAlias || null,
            role: "agent",
            is_active: true,
          },
        ]);

      if (insertError) throw insertError;

      setNewEmail("");
      setNewName("");
      setNewPhone("");
      setNewAlias("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add agent");
    } finally {
      setLoading(false);
    }
  };

  const startEditAlias = (agent: Agent) => {
    setEditingAliasId(agent.id);
    setAliasDraft(agent.alias_email || "");
  };

  const cancelEditAlias = () => {
    setEditingAliasId(null);
    setAliasDraft("");
  };

  const saveAlias = async (agent: Agent) => {
    setBusyAgentId(agent.id);
    try {
      const response = await authedFetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ alias_email: aliasDraft || null }),
      });
      if (response.ok) {
        cancelEditAlias();
        onRefresh();
      } else {
        setError((await response.json()).error || "Failed to update alias");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update alias");
    } finally {
      setBusyAgentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Add New Agent</h2>
        <form onSubmit={handleAddAgent} className="space-y-3">
          <input
            type="email"
            placeholder="Agent Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
          <input
            type="text"
            placeholder="Agent Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
          <input
            type="tel"
            placeholder="Phone Number (E.164: +923001234567)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            required
            className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
          <input
            type="email"
            placeholder="Mailbox Alias (optional, e.g. name@thejetzt.com)"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 px-4 rounded-lg transition-all active:translate-y-px"
          >
            {loading ? "Adding..." : "Add Agent"}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Mailbox Alias</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4 text-sm text-foreground">{agent.display_name}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{agent.email}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{agent.phone_number}</td>
                <td className="px-6 py-4 text-sm">
                  {editingAliasId === agent.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="email"
                        value={aliasDraft}
                        onChange={(e) => setAliasDraft(e.target.value)}
                        placeholder="name@thejetzt.com"
                        className="px-2 py-1 border border-border rounded-md bg-background text-foreground text-xs w-40 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                      />
                      <button
                        onClick={() => saveAlias(agent)}
                        disabled={busyAgentId === agent.id}
                        className="text-xs text-accent-green-foreground hover:underline disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditAlias}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditAlias(agent)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {agent.alias_email || <span className="italic">Set alias</span>}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                      agent.is_active
                        ? "bg-accent-green/15 text-accent-green-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {agent.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                  <button
                    onClick={() => handleToggleActive(agent)}
                    disabled={busyAgentId === agent.id}
                    className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                  >
                    {agent.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDeleteAgent(agent)}
                    disabled={busyAgentId === agent.id}
                    className="ml-1 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
