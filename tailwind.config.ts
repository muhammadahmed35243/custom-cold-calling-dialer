import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        background: "oklch(var(--background) / <alpha-value>)",
        foreground: "oklch(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "oklch(var(--card) / <alpha-value>)",
          foreground: "oklch(var(--card-foreground) / <alpha-value>)",
        },
        // Primary buttons use the brand colour (DIDIBYTE near-black).
        primary: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          foreground: "rgb(var(--brand-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground) / <alpha-value>)",
        },
        "accent-green": {
          DEFAULT: "oklch(var(--accent-green) / <alpha-value>)",
          foreground: "oklch(var(--accent-green-foreground) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          foreground: "rgb(var(--brand-foreground) / <alpha-value>)",
          // Darker amber for brand-coloured text and icons on white: the
          // bright brand colour alone is too faint to read as text.
          strong: "rgb(var(--brand-strong) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
          // DIDIBYTE's red accent dot.
          dot: "rgb(var(--brand-dot) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground) / <alpha-value>)",
        },
        border: "oklch(var(--border) / <alpha-value>)",
        input: "oklch(var(--input) / <alpha-value>)",
        ring: "oklch(var(--ring) / <alpha-value>)",
      },
      boxShadow: {
        // Soft, layered shadows: cards sit just above the page, popovers
        // and dialogs clearly above everything.
        soft: "0 1px 2px 0 rgb(39 39 45 / 0.04), 0 15px 40px 0 rgb(39 39 45 / 0.03)",
        "soft-hover": "0 2px 6px 0 rgb(39 39 45 / 0.06), 0 20px 48px -8px rgb(39 39 45 / 0.10)",
        lift: "0 24px 64px -16px rgb(29 29 31 / 0.22), 0 4px 12px -4px rgb(29 29 31 / 0.08)",
        glow: "0 1px 2px 0 rgb(29 29 31 / 0.20), 0 6px 16px -4px rgb(29 29 31 / 0.25)",
      },
      borderRadius: {
        sm: "calc(var(--radius) * 0.6)",
        md: "calc(var(--radius) * 0.8)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) * 1.4)",
        "2xl": "calc(var(--radius) * 1.8)",
      },
    },
  },
  plugins: [],
};

export default config;
