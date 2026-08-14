import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary, #2563eb)",
        secondary: "var(--color-secondary, #64748b)",
        accent: "var(--color-accent, #f59e0b)",
      },
    },
  },
  plugins: [],
};

export default config;
