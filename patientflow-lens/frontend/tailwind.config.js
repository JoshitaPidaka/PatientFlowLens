/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), surface2: v("surface2"), line: v("line"),
        ink: v("ink"), muted: v("muted"), brand: v("brand"), brand2: v("brand2"), accent: v("accent"),
        bad: v("bad"), good: v("good"), neutral: v("neutral"), warn: v("warn"),
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      borderRadius: { xl: "12px", "2xl": "16px", "3xl": "22px" },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.05), 0 8px 24px rgba(16,24,40,.05)",
        pop: "0 12px 40px rgba(16,24,40,.18)",
      },
      keyframes: {
        pulsering: { "0%,100%": { boxShadow: "0 0 0 0 rgba(245,158,11,.45)" }, "50%": { boxShadow: "0 0 0 8px rgba(245,158,11,0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: { pulsering: "pulsering 1.8s ease-in-out infinite", shimmer: "shimmer 1.4s infinite" },
    },
  },
  plugins: [],
};
