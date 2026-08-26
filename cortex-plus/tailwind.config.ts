import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        obsidian: "var(--color-obsidian)",
        abyss: "var(--color-abyss)",
        graphite: "var(--color-graphite)",
        steel: "var(--color-steel)",
        silver: "var(--color-silver)",
        ash: "var(--color-ash)",
        cloud: "var(--color-cloud)",
        pure: "var(--color-pure)",
        void: "var(--color-void)",
        "iris-gleam": "var(--color-iris-gleam)",
        "cyan-signal": "var(--color-cyan-signal)",
        "pale-iris": "var(--color-pale-iris)",
        "deep-iris": "var(--color-deep-iris)",
        "orchid-bloom": "var(--color-orchid-bloom)",
        periwinkle: "var(--color-periwinkle)",
      },
      fontFamily: {
        display: ["var(--font-dm-serif)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-roboto-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        origin: "var(--radius-buttons)",
        card: "var(--radius-cards)",
        feature: "var(--radius-featurecards)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
