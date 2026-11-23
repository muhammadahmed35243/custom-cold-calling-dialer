// DIDIBYTE's logo (public/didibyte.svg, from didibyte.com). The old JetztLogo
// name is kept so every page that imports it picks up the new logo.
export function JetztLogo({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/didibyte.svg" alt="DIDIBYTE" className={className} />;
}

export const BrandLogo = JetztLogo;

export function Logo({ product = "Dialer" }: { product?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <JetztLogo className="h-7 w-auto" />
      {product && (
        <span className="font-mono text-[12px] text-muted-foreground border-l border-border pl-2.5">{product}</span>
      )}
    </div>
  );
}
