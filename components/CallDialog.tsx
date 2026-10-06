"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

type Props = {
  leadName: string;
  leadPhone: string;
  status: string;
  startedAt: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  onHangUp: () => void;
  onToggleMute?: () => void;
  hangingUp: boolean;
};

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CallDialog({
  leadName,
  leadPhone,
  status,
  startedAt,
  notes,
  onNotesChange,
  onHangUp,
  onToggleMute,
  hangingUp,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    notesRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Call in progress</h3>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-green-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse" />
            {formatElapsed(elapsed)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Avatar name={leadName} size="lg" />
          <div>
            <div className="text-base font-semibold text-foreground">{leadName}</div>
            <div className="text-sm text-muted-foreground font-mono">{leadPhone}</div>
            <div className="text-sm font-medium text-brand mt-1">{status}</div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={5}
            placeholder="Jot down what the lead says (saved automatically)"
            className="mt-2 w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
            >
              Mute
            </button>
          )}
          <button
            onClick={onHangUp}
            disabled={hangingUp}
            className="px-4 py-2 text-sm font-medium bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-destructive-foreground rounded-lg transition-colors"
          >
            {hangingUp ? "Hanging up..." : "Hang Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
