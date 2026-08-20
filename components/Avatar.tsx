const AVATAR_TONES = ["bg-brand text-brand-foreground", "bg-foreground text-background", "bg-muted text-muted-foreground"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic by name so the same person always gets the same tone,
// cycling through on-brand colors rather than arbitrary rainbow hues.
function toneForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-16 w-16 text-xl",
};

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold shrink-0 ${SIZE_CLASSES[size]} ${toneForName(name)}`}
    >
      {getInitials(name)}
    </div>
  );
}
