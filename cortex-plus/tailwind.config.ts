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
        bg: "var(--c-bg)",
        "surface-1": "var(--c-surface-1)",
        "surface-2": "var(--c-surface-2)",
        "surface-3": "var(--c-surface-3)",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        brand: {
          DEFAULT: "var(--c-brand)",
          hover: "var(--c-brand-hover)",
          soft: "var(--c-brand-soft)",
          foreground: "var(--c-on-brand)",
        },
        action: {
          DEFAULT: "var(--c-action)",
          hover: "var(--c-action-hover)",
          pressed: "var(--c-action-pressed)",
          soft: "var(--c-action-soft)",
          foreground: "var(--c-on-action)",
        },
        ai: {
          DEFAULT: "var(--c-ai)",
          soft: "var(--c-ai-soft)",
        },
        success: {
          DEFAULT: "var(--c-success)",
          soft: "var(--c-success-soft)",
        },
        danger: {
          DEFAULT: "var(--c-danger)",
          soft: "var(--c-danger-soft)",
        },
        warning: {
          DEFAULT: "var(--c-warning)",
          soft: "var(--c-warning-soft)",
        },
        info: {
          DEFAULT: "var(--c-info)",
          soft: "var(--c-info-soft)",
        },
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
      },
      borderRadius: {
        lg: "var(--r-lg)",
        md: "var(--r-md)",
        sm: "var(--r-sm)",
        xl: "var(--r-xl)",
        "2xl": "var(--r-2xl)",
        pill: "var(--r-pill)",
      },
      boxShadow: {
        "sh-1": "var(--sh-1)",
        "sh-2": "var(--sh-2)",
        "sh-3": "var(--sh-3)",
        "glow-brand": "var(--glow-brand)",
        "glow-action": "var(--glow-action)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
        count: "var(--dur-count)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
      },
      fontSize: {
        12: "var(--fs-12)",
        14: "var(--fs-14)",
        16: "var(--fs-16)",
        18: "var(--fs-18)",
        22: "var(--fs-22)",
        28: "var(--fs-28)",
        36: "var(--fs-36)",
        48: "var(--fs-48)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
