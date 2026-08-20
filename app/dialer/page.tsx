"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";
import type { Lead, Call } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default function DialerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [callStatus, setCallStatus] = useState<string>("");
  const [disposition, setDisposition] = useState<string>("");
  const [dispositionNotes, setDispositionNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddLeadForm, setShowAddLeadForm] = useState(false);
  const [addLeadForm, setAddLeadForm] = useState({ name: "", phone: "", company: "", notes: "" });
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
      loadLeadsAndCalls(authUser.email);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const loadLeadsAndCalls = async (agentEmail: string) => {
    // Load pending leads
    const { data: leadsData } = await supabaseClient
      .from("leads")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    setLeads(leadsData || []);
    if (leadsData && leadsData.length > 0) setCurrentLead(leadsData[0]);

    // Load agent's calls
    const { data: callsData } = await supabaseClient
      .from("calls")
      .select("*")
      .eq("agent_email", agentEmail)
      .order("created_at", { ascending: false });

    setCalls(callsData || []);
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
        loadLeadsAndCalls(user.email);
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

  const pollCallStatus = async (callId: string) => {
    const interval = setInterval(async () => {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        clearInterval(interval);
        return;
      }

      const response = await fetch(`/api/calls/${callId}/status`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const data = await response.json();

      setActiveCall(data.call);
      setCallStatus(data.status);

      if (["completed", "no_answer", "failed"].includes(data.status)) {
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleDisposition = async () => {
    if (!activeCall || !disposition) return;

    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) {
        setCallStatus("Session expired, please login again");
        return;
      }

      const response = await fetch(`/api/leads/${activeCall.lead_id}/disposition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ disposition, notes: dispositionNotes }),
      });

      if (response.ok) {
        setActiveCall(null);
        setCallStatus("");
        setDisposition("");
        setDispositionNotes("");
        loadLeadsAndCalls(user.email);
      }
    } catch (error) {
      setCallStatus(`Error: ${error}`);
    }
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
        setAddLeadForm({ name: "", phone: "", company: "", notes: "" });
        setTimeout(() => {
          setShowAddLeadForm(false);
          setAddLeadStatus("");
          loadLeadsAndCalls(user.email);
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
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Logo />
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
                    setAddLeadForm({ name: "", phone: "", company: "", notes: "" });
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
                <p className="text-xs text-muted-foreground mt-2">CSV format: name, phone, company (optional), notes (optional)</p>
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
                      className={`w-full text-left px-6 py-3.5 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors ${
                        currentLead?.id === lead.id ? "bg-muted border-l-2 border-l-foreground" : ""
                      }`}
                    >
                      <div className="text-sm font-medium text-foreground">{lead.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{lead.phone}</div>
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
                <h3 className="text-sm font-semibold text-foreground mb-4">Active Call</h3>
                <div className="mb-4">
                  <div className="text-sm text-muted-foreground mb-2">Status: <span className="text-foreground font-medium">{callStatus}</span></div>
                </div>

                {["completed", "no_answer", "failed"].includes(callStatus) && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Disposition</label>
                      <select
                        value={disposition}
                        onChange={(e) => setDisposition(e.target.value)}
                        className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                      >
                        <option value="">Select outcome...</option>
                        <option value="connected">Connected</option>
                        <option value="voicemail">Voicemail</option>
                        <option value="no_answer">No Answer</option>
                        <option value="busy">Busy</option>
                        <option value="callback">Callback</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</label>
                      <textarea
                        value={dispositionNotes}
                        onChange={(e) => setDispositionNotes(e.target.value)}
                        placeholder="Add any notes..."
                        className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                        rows={3}
                      />
                    </div>

                    <button
                      onClick={handleDisposition}
                      disabled={!disposition}
                      className="w-full bg-accent-green hover:bg-accent-green/90 disabled:opacity-40 text-accent-green-foreground font-medium py-2.5 px-4 rounded-lg transition-all active:translate-y-px"
                    >
                      Save &amp; Next
                    </button>
                  </div>
                )}
              </div>
            ) : currentLead ? (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Current Lead</h3>
                <div className="space-y-2 mb-6">
                  <div>
                    <span className="text-sm text-muted-foreground">Name: </span>
                    <span className="text-sm font-medium text-foreground">{currentLead.name}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Phone: </span>
                    <span className="text-sm font-medium text-foreground font-mono">{currentLead.phone}</span>
                  </div>
                  {currentLead.company && (
                    <div>
                      <span className="text-sm text-muted-foreground">Company: </span>
                      <span className="text-sm font-medium text-foreground">{currentLead.company}</span>
                    </div>
                  )}
                  {currentLead.notes && (
                    <div>
                      <span className="text-sm text-muted-foreground">Notes: </span>
                      <span className="text-sm text-foreground">{currentLead.notes}</span>
                    </div>
                  )}
                </div>

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

            {/* Call History */}
            {calls.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Your Call History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {calls.slice(0, 10).map((call) => (
                    <div key={call.id} className="p-3 bg-muted rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium text-foreground">{call.disposition || "pending"}</span>
                        <span className="text-muted-foreground">
                          {call.duration_seconds ? `${call.duration_seconds}s` : "-"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(call.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
