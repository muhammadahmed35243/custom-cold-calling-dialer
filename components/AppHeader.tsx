"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { isAdminRole } from "@/lib/roles";

// The bar across the top of every signed-in page: logo, the sections this
// person can open, and their account. Stays put while scrolling; on phones
// the sections fold into a menu.
export function AppHeader({
  userEmail,
  role,
  onSignOut,
}: {
  userEmail?: string;
  role?: string | null;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = isAdminRole(role);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { label: "Dialer", href: "/dialer" },
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
    ...(role === "super_admin" ? [{ label: "Super Admin", href: "/super-admin" }] : []),
    { label: "Mail", href: "/mail" },
  ];

  // Close the phone menu after moving to another page.
  useEffect(() => setMenuOpen(false), [pathname]);

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };
  const initial = (userEmail || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <button
            onClick={() => go(isAdmin ? "/dashboard" : "/dialer")}
            className="shrink-0 rounded-md"
            aria-label="JETZT Dialer home"
          >
            <Logo />
          </button>
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => go(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={`h-9 px-3 text-sm font-medium rounded-lg transition-colors ${
                    active
                      ? "bg-brand-soft text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3 min-w-0">
          {userEmail && (
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="h-8 w-8 shrink-0 rounded-full bg-brand text-brand-foreground text-xs font-semibold flex items-center justify-center"
              >
                {initial}
              </span>
              <span className="text-sm text-muted-foreground truncate max-w-[220px]" title={userEmail}>
                {userEmail}
              </span>
            </div>
          )}
          <button onClick={onSignOut} className="btn btn-sm btn-secondary">
            Sign out
          </button>
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="md:hidden btn btn-ghost h-10 w-10 px-0"
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div id="app-menu" className="md:hidden border-t border-border bg-card px-4 pb-4 pt-2 shadow-lift">
          <nav className="flex flex-col gap-1" aria-label="Main">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => go(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={`h-11 px-3 text-left text-sm font-medium rounded-lg ${
                    active ? "bg-brand-soft text-foreground" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
            {userEmail && <span className="text-sm text-muted-foreground truncate">{userEmail}</span>}
            <button onClick={onSignOut} className="btn btn-sm btn-secondary shrink-0">
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
