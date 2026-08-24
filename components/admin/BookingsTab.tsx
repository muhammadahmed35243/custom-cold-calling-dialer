"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { CalendlyBooking } from "@/lib/voice-agent/types";

export function BookingsTab() {
  const [bookings, setBookings] = useState<CalendlyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await authedFetch("/api/voice-agent/bookings");
      const body = await res.json();
      if (res.ok) setBookings(body.bookings);
      else setError(body.error || "Failed to load");
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (error) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted border-b border-border">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Caller</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Invitee</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Scheduled Time</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bookings.map((b) => (
            <tr key={b.id} className="hover:bg-muted/50 transition-colors">
              <td className="px-6 py-4 text-sm text-foreground font-mono">{b.caller_phone}</td>
              <td className="px-6 py-4 text-sm text-muted-foreground">
                {b.invitee_name} ({b.invitee_email})
              </td>
              <td className="px-6 py-4 text-sm text-foreground">
                {b.scheduled_time ? new Date(b.scheduled_time).toLocaleString() : "-"}
              </td>
              <td className="px-6 py-4 text-sm">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                    b.status === "booked" ? "bg-accent-green/15 text-accent-green-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {b.status}
                </span>
              </td>
            </tr>
          ))}
          {bookings.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-sm text-muted-foreground text-center">
                No bookings yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
