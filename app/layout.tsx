import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SplashScreen } from "@/components/SplashScreen";
import { AppReadyProvider } from "@/components/AppReadyContext";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JETZT Dialer",
  description: "Power dialer for cold calling",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background text-foreground font-sans antialiased">
        <AppReadyProvider>
          <SplashScreen />
          <Providers>{children}</Providers>
        </AppReadyProvider>
      </body>
    </html>
  );
}
