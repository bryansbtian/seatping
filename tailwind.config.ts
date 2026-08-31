import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        label: ["var(--font-size-label)", { lineHeight: "var(--line-height-label)" }],
        body: ["var(--font-size-body)", { lineHeight: "var(--line-height-body)" }],
        title: ["var(--font-size-title)", { lineHeight: "var(--line-height-title)" }],
        "preview-xs": ["var(--font-size-preview-xs)", { lineHeight: "0.75rem" }],
        "preview-sm": ["var(--font-size-preview-sm)", { lineHeight: "0.75rem" }],
        micro: ["var(--font-size-micro)", { lineHeight: "0.875rem" }],
        caption: ["var(--font-size-caption)", { lineHeight: "1rem" }],
        calendar: "var(--font-size-calendar)",
        "hand-accent": "var(--font-size-hand-accent)",
        "display-compact": "var(--font-size-display-compact)",
        xs: ["var(--font-size-xs)", { lineHeight: "1rem" }],
        sm: ["var(--font-size-sm)", { lineHeight: "1.25rem" }],
        base: ["var(--font-size-base)", { lineHeight: "1.5rem" }],
        lg: ["var(--font-size-lg)", { lineHeight: "1.75rem" }],
        xl: ["var(--font-size-xl)", { lineHeight: "1.75rem" }],
        "2xl": ["var(--font-size-2xl)", { lineHeight: "2rem" }],
        "3xl": ["var(--font-size-3xl)", { lineHeight: "2.25rem" }],
        "4xl": ["var(--font-size-4xl)", { lineHeight: "2.5rem" }],
        "5xl": ["var(--font-size-5xl)", { lineHeight: "1" }],
        "6xl": ["var(--font-size-6xl)", { lineHeight: "1" }],
        "7xl": ["var(--font-size-7xl)", { lineHeight: "1" }],
        "8xl": ["var(--font-size-8xl)", { lineHeight: "1" }],
        "9xl": ["var(--font-size-9xl)", { lineHeight: "1" }],
      },
      colors: {
        ink: {
          DEFAULT: "hsl(var(--ink))",
          subtle: "hsl(var(--ink-subtle))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          glow: "hsl(var(--success-glow))",
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          hover: "hsl(var(--sidebar-hover))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        control: "var(--radius-control)",
        badge: "var(--radius-badge)",
      },
      spacing: {
        row: "var(--row-height)",
        "row-lg": "var(--row-height-lg)",
        badge: "var(--badge-height)",
        "switch-w": "var(--switch-width)",
        "switch-h": "var(--switch-height)",
        "switch-thumb": "var(--switch-thumb)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        fadePulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "scroll-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "scroll-right": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        "bento-reveal": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "bento-ticker": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
        "bento-cycle": {
          "0%": { opacity: "0" },
          "4%, 29.5%": { opacity: "1" },
          "36%, 100%": { opacity: "0" },
        },
        "bento-toast": {
          "0%, 10%": { opacity: "0", transform: "translateY(10px) scale(0.97)" },
          "18%, 72%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "82%, 100%": { opacity: "0", transform: "translateY(-8px) scale(0.98)" },
        },
        "bento-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        fadePulse: "fadePulse 5s ease-in-out infinite",
        "scroll-left": "scroll-left 30s linear infinite",
        "scroll-right": "scroll-right 30s linear infinite",
        "scroll-left-mobile": "scroll-left 15s linear infinite",
        "scroll-right-mobile": "scroll-right 15s linear infinite",
        "bento-reveal": "bento-reveal 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "bento-ticker": "bento-ticker 20s linear infinite",
        "bento-cycle": "bento-cycle 9s linear infinite",
        "bento-toast": "bento-toast 6s ease-in-out infinite",
        "bento-float": "bento-float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
