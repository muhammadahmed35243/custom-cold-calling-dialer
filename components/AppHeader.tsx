"use client";

import { useRouter, usePathname } from "next/navigation";
import { Logo } from "./Logo";

export function AppHeader({
  userEmail,
  isAdmin,
  onSignOut,
}: {
  userEmail?: string;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { label: "Dialer", href: "/dialer" },
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
    { label: "Mail", href: "/mail" },
  ];

  return (
    <header className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <button onClick={() => router.push(isAdmin ? "/dashboard" : "/dialer")} className="cursor-pointer">
            <Logo />
          </button>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  pathname === item.href
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {userEmail && <span className="text-sm text-muted-foreground">{userEmail}</span>}
          <button
            onClick={onSignOut}
            className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
