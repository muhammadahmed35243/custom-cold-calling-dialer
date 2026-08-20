"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";
import type { Lead, Call } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { StatRow } from "@/components/StatRow";
import { PencilIcon, ClockIcon, CheckIcon, XIcon, MailIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function DialerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [callStatus, setCallStatus] = useState<string>("");
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ disposition: "", notes: "", callbackAt: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [emailModalCall, setEmailModalCall] = useState<Call | null>(null);
  const [emailDraft, setEmailDraft] = useState({ subject: "", body: "" });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddLeadForm, setShowAddLeadForm] = useState(false);
  const [addLeadForm, setAddLeadForm] = useState({ name: "", phone: "", email: "", company: "", notes: "" });
  const [addLeadStatus, setAddLeadStatus] = useState<string>("");
  const [isAddingLead, setIsAddingLead] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (!authUser?.email) {
        router.push("/auth/login");
        return;
      }

      // Check if authorized agent
      const { data: agent } = await supabaseClient
        .from("agents")
        .select("*")
        .eq("email", authUser.email)
        .single();

      if (!agent || !agent.is_active) {
        router.push("/auth/login?error=unauthorized");
        return;
      }

      setUser(authUser);
      setIsAdmin(agent.role === "admin");
      loadLeadsAndCalls();
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const loadLeadsAndCalls = async () => {
    // Load pending leads
    const { data: leadsData } = await supabaseClient
      .from("leads")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    setLeads(leadsData || []);
    if (leadsData && leadsData.length > 0) setCurrentLead(leadsData[0]);

    // Load agent's calls (joined with lead name/phone -- routed through a
    // server API because the leads RLS policy only allows reading
    // status='pending' rows via the client, which would hide the lead info
    // for every already-called row in a direct client-side join)
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) return;

    const response = await fetch("/api/calls", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (response.ok) {
      const { calls: callsData } = await response.json();
      setCalls(callsData || []);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || !user) return;
    setIsUploading(true);
    setUploadStatus("Uploading...");

    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        setUploadStatus("✗ Session expired, please login again");
        return;
      }

      const text = await file.text();
      const response = await fetch("/api/leads/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ csv: text }),
      });

      const result = await response.json();
      if (response.ok) {
        setUploadStatus(`✓ ${result.imported} leads imported${result.errors?.length ? `, ${result.errors.length} skipped` : ""}`);
        loadLeadsAndCalls();
      } else {
        setUploadStatus(`✗ Upload failed: ${result.error}`);
      }
    } catch (error) {
      setUploadStatus(`✗ Error: ${error}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCall = async (lead: Lead) => {
    if (!user) return;

    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        setCallStatus("Session expired, please login again");
        return;
      }

      const response = await fetch("/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const result = await response.json();
      if (response.ok) {
        setActiveCall({ ...result.call, agent_email: user.email } as Call);
        setCallStatus("Ringing...");
        pollCallStatus(result.call.id);
      } else {
        setCallStatus(`Error: ${result.error}`);
      }
    } catch (error) {
      setCallStatus(`Error: ${error}`);
    }
  };

  // A setInterval-based poll can fire the next request before the current
  // one's response has come back -- if responses ever resolve out of order,
  // a stale one can land after a fresher one and flip the UI backwards
  // (e.g. "ringing" back to "initiated"). Self-scheduling the next poll only
  // after the current one resolves rules that out structurally.
  const pollCallStatus = (callId: string) => {
    let cancelled = false;

    const tick = async () => {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session || cancelled) return;

      const response = await fetch(`/api/calls/${callId}/status`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (cancelled) return;

      if (["completed", "no_answer", "failed"].includes(data.status)) {
        cancelled = true;
        setActiveCall(null);
        setCallStatus("");
        await loadLeadsAndCalls();
        startEdit(data.call);
        return;
      }

      setActiveCall(data.call);
      setCallStatus(data.status);
      setTimeout(tick, 2000);
    };

    setTimeout(tick, 2000);
  };

  const toDatetimeLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const startEdit = (call: Call) => {
    setEditingCallId(call.id);
    setEditDraft({
      disposition: call.disposition || "",
      notes: call.notes || "",
      callbackAt: toDatetimeLocal(call.callback_at),
    });
  };

  const cancelEdit = () => {
    setEditingCallId(null);
    setEditDraft({ disposition: "", notes: "", callbackAt: "" });
  };

  const startCallbackEdit = (call: Call) => {
    setEditingCallId(call.id);
    setEditDraft({
      disposition: "callback",
      notes: call.notes || "",
      callbackAt: toDatetimeLocal(call.callback_at),
    });
  };

  const openEmailModal = (call: Call) => {
    const name = call.leads?.name || "there";
    setEmailModalCall(call);
    setEmailError(null);
    setEmailDraft({
      subject: "Great speaking with you – JETZT",
      body: `Hi ${name},\n\nThanks for taking the time to speak with me just now. As promised, following up here -- feel free to reply to this email with any questions, or let me know a good time if you'd like to continue the conversation.\n\nBest,\nJETZT`,
    });
  };

  const closeEmailModal = () => {
    setEmailModalCall(null);
    setEmailError(null);
  };

  const sendFollowupEmail = async () => {
    if (!emailModalCall || !emailDraft.subject || !emailDraft.body) return;
    setSendingEmail(true);
    setEmailError(null);

    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        setEmailError("Session expired, please login again");
        return;
      }

      const response = await fetch(`/api/calls/${emailModalCall.id}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(emailDraft),
      });

      if (response.ok) {
        closeEmailModal();
      } else {
        const result = await response.json();
        setEmailError(result.error || "Failed to send");
      }
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Failed to send");
    } finally {
      setSendingEmail(false);
    }
  };

  const saveEdit = async (callId: string) => {
    if (!editDraft.disposition || !user) return;
    setSavingEdit(true);

    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        setCallStatus("Session expired, please login again");
        return;
      }

      const response = await fetch(`/api/calls/${callId}/disposition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          disposition: editDraft.disposition,
          notes: editDraft.notes,
          callbackAt: editDraft.callbackAt ? new Date(editDraft.callbackAt).toISOString() : null,
        }),
      });

      if (response.ok) {
        cancelEdit();
        await loadLeadsAndCalls();
      }
    } catch (error) {
      setCallStatus(`Error: ${error}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // Most recent call per lead, where that call's outcome is still "callback"
  // -- since `calls` is sorted newest-first, the first hit per lead_id wins,
  // so a lead that was called back and re-dispositioned since naturally
  // drops off this list without a separate query.
  const callbackEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: { leadId: string; name: string; phone: string; email: string | null; callbackAt: string | null }[] = [];
    for (const call of calls) {
      if (seen.has(call.lead_id)) continue;
      seen.add(call.lead_id);
      if (call.disposition === "callback" && call.leads) {
        entries.push({
          leadId: call.lead_id,
          name: call.leads.name,
          phone: call.leads.phone,
          email: call.leads.email,
          callbackAt: call.callback_at,
        });
      }
    }
    return entries;
  }, [calls]);

  const todayStats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todaysCalls = calls.filter((call) => new Date(call.created_at) >= startOfToday);
    const connectedToday = todaysCalls.filter((call) => call.disposition === "connected");
    const durations = todaysCalls.filter((call) => call.duration_seconds).map((call) => call.duration_seconds!);
    const avgDuration = durations.length
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : 0;

    return {
      pending: leads.length,
      calledToday: todaysCalls.length,
      connectedToday: connectedToday.length,
      avgDuration: avgDuration ? `${avgDuration}s` : "-",
    };
  }, [calls, leads]);

  const handleCallbackNow = (entry: { leadId: string; name: string; phone: string; email: string | null }) => {
    const leadStub: Lead = {
      id: entry.leadId,
      name: entry.name,
      phone: entry.phone,
      email: entry.email,
      company: null,
      notes: null,
      status: "callback",
      assigned_agent: null,
      uploaded_batch_id: null,
      created_at: "",
      updated_at: "",
    };
    setCurrentLead(leadStub);
    handleCall(leadStub);
  };

  const handleAddLead = async () => {
    if (!addLeadForm.name || !addLeadForm.phone) {
      setAddLeadStatus("Name and phone are required");
      return;
    }

    setIsAddingLead(true);
    setAddLeadStatus("");

    try {
      // Get auth token
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        setAddLeadStatus("✗ Session expired, please login again");
        return;
      }

      const response = await fetch("/api/leads/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(addLeadForm),
      });

      const result = await response.json();
      if (response.ok) {
        setAddLeadStatus(`✓ ${result.message}`);
        setAddLeadForm({ name: "", phone: "", email: "", company: "", notes: "" });
        setTimeout(() => {
          setShowAddLeadForm(false);
          setAddLeadStatus("");
          loadLeadsAndCalls();
        }, 1500);
      } else {
        setAddLeadStatus(`✗ ${result.error}`);
      }
    } catch (error) {
      setAddLeadStatus(`✗ Error: ${error}`);
    } finally {
      setIsAddingLead(false);
    }
  };

  const handleSignOut = async () => {
    await supabaseAuth.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userEmail={user?.email} isAdmin={isAdmin} onSignOut={handleSignOut} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <StatRow
            stats={[
              { label: "Pending", value: todayStats.pending },
              { label: "Called Today", value: todayStats.calledToday },
              { label: "Connected Today", value: todayStats.connectedToday },
              { label: "Avg Duration", value: todayStats.avgDuration },
            ]}
          />
        </div>

        {/* Upload Options */}
        <div className="bg-card border border-border rounded-xl p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-foreground">Add Leads</h2>
            <button
              onClick={() => setShowAddLeadForm(!showAddLeadForm)}
              className="text-sm px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              {showAddLeadForm ? "Hide" : "Add Manually"}
            </button>
          </div>

          {showAddLeadForm ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name *"
                value={addLeadForm.name}
                onChange={(e) => setAddLeadForm({ ...addLeadForm, name: e.target.value })}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <input
                type="tel"
                placeholder="Phone Number * (e.g., +923001234567)"
                value={addLeadForm.phone}
                onChange={(e) => setAddLeadForm({ ...addLeadForm, phone: e.target.value })}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={addLeadForm.email}
                onChange={(e) => setAddLeadForm({ ...addLeadForm, email: e.target.value })}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <input
                type="text"
                placeholder="Company (optional)"
                value={addLeadForm.company}
                onChange={(e) => setAddLeadForm({ ...addLeadForm, company: e.target.value })}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <textarea
                placeholder="Notes (optional)"
                value={addLeadForm.notes}
                onChange={(e) => setAddLeadForm({ ...addLeadForm, notes: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddLead}
                  disabled={isAddingLead || !addLeadForm.name || !addLeadForm.phone}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg transition-all active:translate-y-px"
                >
                  {isAddingLead ? "Adding..." : "Add Lead"}
                </button>
                <button
                  onClick={() => {
                    setShowAddLeadForm(false);
                    setAddLeadForm({ name: "", phone: "", email: "", company: "", notes: "" });
                    setAddLeadStatus("");
                  }}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
              {addLeadStatus && (
                <div className={`text-sm p-2.5 rounded-lg ${addLeadStatus.startsWith("✓") ? "bg-accent-green/15 text-accent-green-foreground" : "bg-destructive/10 text-destructive"}`}>
                  {addLeadStatus}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Upload CSV</h3>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    disabled={isUploading}
                    className="text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-secondary file:text-secondary-foreground file:text-sm file:font-medium hover:file:bg-secondary/80 file:cursor-pointer"
                  />
                  {uploadStatus && (
                    <span className={`text-sm ${uploadStatus.startsWith("✓") ? "text-accent-green-foreground" : "text-destructive"}`}>
                      {uploadStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">CSV format: name, phone, email (optional), company (optional), notes (optional)</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="bg-muted px-6 py-3.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Pending Leads ({leads.length})</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {leads.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No pending leads</div>
                ) : (
                  leads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setCurrentLead(lead)}
                      className={`w-full flex items-center gap-3 text-left px-6 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors ${
                        currentLead?.id === lead.id ? "bg-muted border-l-2 border-l-brand" : ""
                      }`}
                    >
                      <Avatar name={lead.name} size="sm" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{lead.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{lead.phone}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Call Controls */}
          <div className="lg:col-span-2 space-y-6">
            {activeCall ? (
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold text-foreground">Active Call</h3>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-green-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse" />
                    Live
                  </span>
                </div>
                <div className="flex flex-col items-center text-center gap-3">
                  <Avatar name={currentLead?.name || "lead"} size="lg" />
                  <div>
                    <div className="text-base font-semibold text-foreground">{currentLead?.name || "Lead"}</div>
                    <div className="text-sm text-muted-foreground font-mono">{currentLead?.phone}</div>
                  </div>
                  <span className="text-sm font-medium text-brand">{callStatus}</span>
                </div>
              </div>
            ) : currentLead ? (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Current Lead</h3>
                <div className="flex items-center gap-4 mb-6">
                  <Avatar name={currentLead.name} size="lg" />
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-foreground">{currentLead.name}</div>
                    <div className="text-sm text-muted-foreground font-mono">{currentLead.phone}</div>
                    {currentLead.email && <div className="text-sm text-muted-foreground">{currentLead.email}</div>}
                    {currentLead.company && <div className="text-sm text-muted-foreground">{currentLead.company}</div>}
                  </div>
                </div>
                {currentLead.notes && (
                  <div className="mb-6 text-sm text-foreground bg-secondary rounded-lg p-3">{currentLead.notes}</div>
                )}

                <button
                  onClick={() => handleCall(currentLead)}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-all active:translate-y-px"
                >
                  Call
                </button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                Upload leads to get started
              </div>
            )}

            {/* Callbacks */}
            {callbackEntries.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="bg-muted px-6 py-3.5 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Callbacks ({callbackEntries.length})</h3>
                </div>
                <div className="divide-y divide-border">
                  {callbackEntries.map((entry) => (
                    <div key={entry.leadId} className="px-6 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar name={entry.name} size="sm" />
                        <div>
                          <div className="text-sm font-medium text-foreground">{entry.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{entry.phone}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.callbackAt && (
                          <span className="text-xs text-muted-foreground">{new Date(entry.callbackAt).toLocaleString()}</span>
                        )}
                        <button
                          onClick={() => handleCallbackNow(entry)}
                          disabled={!!activeCall}
                          className="text-sm px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg transition-colors"
                        >
                          Call Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Call History */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="bg-muted px-6 py-3.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Call History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Lead</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Disposition</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Callback</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Recording</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                      <th className="px-4 py-2.5 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No calls yet</td>
                      </tr>
                    ) : (
                      calls.map((call) => {
                        const isEditing = editingCallId === call.id;
                        return (
                          <tr key={call.id} className={isEditing ? "bg-muted/40" : "hover:bg-muted/20 transition-colors"}>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center gap-2.5">
                                {call.leads?.name && <Avatar name={call.leads.name} size="sm" />}
                                <div>
                                  <div className="font-medium text-foreground">{call.leads?.name || "-"}</div>
                                  <div className="text-xs text-muted-foreground font-mono">{call.leads?.phone || ""}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top text-muted-foreground whitespace-nowrap">
                              {call.duration_seconds ? `${call.duration_seconds}s` : "-"}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {isEditing ? (
                                <select
                                  value={editDraft.disposition}
                                  onChange={(e) => setEditDraft({ ...editDraft, disposition: e.target.value })}
                                  className="px-2.5 py-1.5 border border-border rounded-md bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                                >
                                  <option value="">Select outcome...</option>
                                  <option value="connected">Connected</option>
                                  <option value="voicemail">Voicemail</option>
                                  <option value="no_answer">No Answer</option>
                                  <option value="busy">Busy</option>
                                  <option value="callback">Callback</option>
                                </select>
                              ) : (
                                <StatusBadge status={call.disposition} />
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditDraft({ ...editDraft, disposition: "callback" })}
                                    title="Schedule callback"
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  >
                                    <ClockIcon className="w-4 h-4" />
                                  </button>
                                  {editDraft.disposition === "callback" && (
                                    <input
                                      type="datetime-local"
                                      value={editDraft.callbackAt}
                                      onChange={(e) => setEditDraft({ ...editDraft, callbackAt: e.target.value })}
                                      className="text-xs px-2 py-1 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                                    />
                                  )}
                                </div>
                              ) : call.callback_at ? (
                                <span className="text-xs text-foreground whitespace-nowrap">{new Date(call.callback_at).toLocaleString()}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top max-w-[180px]">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editDraft.notes}
                                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                                  placeholder="Add notes..."
                                  className="w-full text-xs px-2.5 py-1.5 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground line-clamp-2" title={call.notes || ""}>
                                  {call.notes || "-"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {call.recording_url ? (
                                <a
                                  href={call.recording_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-foreground underline underline-offset-2 hover:no-underline text-xs whitespace-nowrap"
                                >
                                  Listen
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(call.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => saveEdit(call.id)}
                                    disabled={!editDraft.disposition || savingEdit}
                                    title="Save"
                                    className="p-1.5 rounded-md hover:bg-accent-green/15 text-accent-green-foreground disabled:opacity-40 transition-colors"
                                  >
                                    <CheckIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    title="Cancel"
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                                  >
                                    <XIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => startEdit(call)}
                                    disabled={!!activeCall || !!editingCallId}
                                    title="Edit"
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                                  >
                                    <PencilIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => startCallbackEdit(call)}
                                    disabled={!!activeCall || !!editingCallId}
                                    title="Set callback"
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                                  >
                                    <ClockIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openEmailModal(call)}
                                    disabled={!!activeCall || !!editingCallId || !call.leads?.email}
                                    title={call.leads?.email ? "Send follow-up email" : "This lead has no email on file"}
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                                  >
                                    <MailIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>

      {emailModalCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                Follow-up to {emailModalCall.leads?.name || "lead"} ({emailModalCall.leads?.email})
              </h3>
              <button
                onClick={closeEmailModal}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={emailDraft.subject}
                onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                placeholder="Subject"
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <textarea
                value={emailDraft.body}
                onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                placeholder="Message"
                rows={9}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />

              {emailError && <div className="text-sm text-destructive">{emailError}</div>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={sendFollowupEmail}
                  disabled={sendingEmail || !emailDraft.subject || !emailDraft.body}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 px-4 rounded-lg transition-all active:translate-y-px"
                >
                  {sendingEmail ? "Sending..." : "Send"}
                </button>
                <button
                  onClick={closeEmailModal}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2.5 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
