/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1A1410",
        paper: "#F8F4ED",
        "paper-light": "#FFFEFA",
        "paper-deep": "#EEE7D9",
        "paper-warm": "#FBF6EC",
        persimmon: "#D14B2C",
        ochre: "#C7944A",
        sage: "#6B7A5C",
        fog: "#888888",
      },
      fontFamily: {
        serif: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      letterSpacing: {
        editorial: "0.2em",
      },
      transitionTimingFunction: {
        expressive: "cubic-bezier(0.16, 1, 0.3, 1)",
        snap: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      borderRadius: {
        "pl-sm": "8px",
        pl: "12px",
        "pl-lg": "16px",
        "pl-xl": "24px",
      },
      boxShadow: {
        soft: "0 6px 16px rgba(26,20,16,0.08), 0 2px 4px rgba(26,20,16,0.06)",
        "soft-md": "0 12px 28px rgba(26,20,16,0.12), 0 4px 10px rgba(26,20,16,0.08)",
        "soft-lg": "0 24px 48px rgba(26,20,16,0.14), 0 8px 16px rgba(26,20,16,0.08)",
        "soft-xl": "0 40px 80px rgba(26,20,16,0.18), 0 10px 20px rgba(26,20,16,0.10)",
      },
      transitionDuration: {
        snap: "180ms",
        expressive: "360ms",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-soft": {
          "0%,100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.5" },
        },
        "pulse-ring": {
          "0%,100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(209,75,44,0.5)" },
          "50%": { transform: "scale(1.08)", boxShadow: "0 0 0 12px rgba(209,75,44,0)" },
        },
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0.3" },
        },
        fadein: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 32s linear infinite",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-in-out infinite",
        blink: "blink 1.2s steps(2, start) infinite",
        fadein: "fadein 0.5s ease",
        "rise-in": "rise-in 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
