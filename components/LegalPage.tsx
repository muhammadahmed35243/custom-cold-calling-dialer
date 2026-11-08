import Link from "next/link";
import { JetztLogo } from "./Logo";
import { MarkReady } from "./MarkReady";

// Shared layout for the public Privacy Policy and Terms of Service pages.
// Plain server-rendered text so anyone (and Google's reviewers) can read it
// without signing in.
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <MarkReady />
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" aria-label="JETZT Dialer home">
            <JetztLogo className="h-7 w-auto" />
          </Link>
          <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-muted-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1.5 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} JETZT</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <a href="mailto:support@thejetzt.com" className="hover:text-foreground transition-colors">support@thejetzt.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
