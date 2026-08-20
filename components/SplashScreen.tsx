"use client";

import { useEffect, useState } from "react";
import { JetztLogo } from "./Logo";

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden hidden md:block">
        <div className="absolute -top-1/2 -right-1/2 h-full w-full rounded-full bg-gradient-to-br from-brand/10 via-transparent to-transparent blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -left-1/2 h-full w-full rounded-full bg-gradient-to-tr from-brand/10 via-transparent to-transparent blur-3xl animate-pulse" />
      </div>

      <div className="relative flex flex-col items-center gap-8">
        <div className="animate-fade-in">
          <JetztLogo className="h-16 w-auto" />
        </div>

        <div className="text-center animate-fade-in-delayed">
          <p className="text-sm text-muted-foreground">Now, not next quarter</p>
        </div>

        <div className="flex gap-2 animate-fade-in-delayed-2">
          <div className="h-2 w-2 rounded-full bg-brand animate-bounce" style={{ animationDelay: "0s" }} />
          <div className="h-2 w-2 rounded-full bg-brand animate-bounce" style={{ animationDelay: "0.1s" }} />
          <div className="h-2 w-2 rounded-full bg-brand animate-bounce" style={{ animationDelay: "0.2s" }} />
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeInDelayed {
          0% {
            opacity: 0;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.6s ease-out forwards;
        }

        .animate-fade-in-delayed {
          animation: fadeInDelayed 1.2s ease-out forwards;
        }

        .animate-fade-in-delayed-2 {
          animation: fadeInDelayed 1.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
