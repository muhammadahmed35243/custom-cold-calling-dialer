import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SplashScreen } from "@/components/SplashScreen";
import { AppReadyProvider } from "@/components/AppReadyContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIDIBYTE Dialer",
  description: "Power dialer for cold calling",
  icons: {
    icon: "/didibyte-favicon.svg",
    apple: "/didibyte-favicon.svg",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${firaCode.variable}`}>
      <body className="bg-background text-foreground font-sans antialiased">
        <AppReadyProvider>
          <SplashScreen />
          <Providers>{children}</Providers>
        </AppReadyProvider>
      </body>
    </html>
  );
}
