import { JetztLogo } from "./Logo";

// Pure presentation, no timing logic -- used both by the once-per-session
// cold-load SplashScreen (which adds its own minimum-display timer) and
// directly by every page's own loading state, so switching between
// Dialer/Admin/Mail shows this instead of a bare "Loading..." text, without
// forcing an artificial minimum wait on routine in-app navigation.
export function BrandedLoader() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">

      <div className="relative flex flex-col items-center gap-8">
        <div className="animate-fade-in">
          <JetztLogo className="h-14 w-auto" />
        </div>

        <div className="text-center animate-fade-in-delayed">
          <p className="font-mono text-xs text-muted-foreground">&lt; making people capable /&gt;</p>
        </div>

        <div className="flex gap-2 animate-fade-in-delayed-2">
          <div className="h-2 w-2 rounded-full bg-brand-dot animate-bounce" style={{ animationDelay: "0s" }} />
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
