/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Corporate palette — BDP
        corp: {
          deep: "#004a8f", // Deep Blue
          core: "#005baa", // Core Blue
          cyan: "#00b0d8", // Cyan
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      transitionTimingFunction: {
        // Spring-like overshoot used for "magnetic" interactions
        spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.10)",
        "glass-lg": "0 24px 64px -12px rgba(0,0,0,0.45)",
        "glass-inner": "inset 0 1px 1px rgba(255,255,255,0.45)",
        "glow-cyan": "0 0 24px rgba(0,176,216,0.55)",
        "glow-green": "0 0 15px rgba(34,197,94,1)",
      },
      keyframes: {
        // Slow, fluid drift for the background mesh blobs
        blob: {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(40px, -60px) scale(1.12)" },
          "66%": { transform: "translate(-30px, 30px) scale(0.92)" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Animated conic sheen used for specular highlights
        shimmer: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        "fade-up": {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        blob: "blob 18s ease-in-out infinite",
        "bounce-in": "bounce-in 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        shimmer: "shimmer 2.8s ease-in-out infinite",
        "fade-up": "fade-up 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
      },
    },
  },
  plugins: [],
};
