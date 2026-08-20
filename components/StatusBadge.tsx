import { CheckCircleIcon, VoicemailIcon, PhoneOffIcon, XCircleIcon, ClockIcon, DotIcon } from "./icons";

type StatusConfig = {
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  label: string;
  className: string;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  connected: { icon: CheckCircleIcon, label: "Connected", className: "bg-accent-green/15 text-accent-green-foreground" },
  active: { icon: CheckCircleIcon, label: "Active", className: "bg-accent-green/15 text-accent-green-foreground" },
  voicemail: { icon: VoicemailIcon, label: "Voicemail", className: "bg-brand/15 text-brand" },
  no_answer: { icon: PhoneOffIcon, label: "No Answer", className: "bg-muted text-muted-foreground" },
  failed: { icon: PhoneOffIcon, label: "Failed", className: "bg-destructive/10 text-destructive" },
  busy: { icon: XCircleIcon, label: "Busy", className: "bg-destructive/10 text-destructive" },
  inactive: { icon: XCircleIcon, label: "Inactive", className: "bg-muted text-muted-foreground" },
  callback: { icon: ClockIcon, label: "Callback", className: "bg-brand/15 text-brand" },
};

export function StatusBadge({ status, fallbackLabel = "Pending" }: { status: string | null; fallbackLabel?: string }) {
  const config = status ? STATUS_MAP[status] : null;

  if (!config) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">
        <DotIcon className="w-2.5 h-2.5" />
        {fallbackLabel}
      </span>
    );
  }

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
