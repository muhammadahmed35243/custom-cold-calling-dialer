export function JetztLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" fill="none" className={className}>
      <polygon points="8,5 16,5 12,15" fill="#FF9500" />
      <rect x="10" y="15" width="5" height="30" fill="#FF9500" />
      <text x="25" y="42" fontSize="35" fontWeight="700" fill="#1a1a1a" fontFamily="system-ui, -apple-system, sans-serif">
        JETZT
      </text>
    </svg>
  );
}

export function Logo({ product = "Dialer" }: { product?: string }) {
  return (
    <div className="flex items-center gap-2">
      <JetztLogo className="h-7 w-auto" />
      {product && (
        <span className="text-sm text-muted-foreground border-l border-border pl-2">{product}</span>
      )}
    </div>
  );
}
