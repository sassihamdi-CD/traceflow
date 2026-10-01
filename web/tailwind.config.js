/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF7F1",
        parchment: "#F3EEE3",
        ink: "#1B1814",
        inksoft: "#4A443B",
        muted: "#8A8175",
        line: "#E3DCCB",
        moss: { DEFAULT: "#2F5D3A", deep: "#22442A", wash: "#E7EFE6" },
        amber: { DEFAULT: "#A86A12", wash: "#F9EED7" },
        brick: { DEFAULT: "#A83A26", wash: "#F9E4DC" },
        stone: { wash: "#ECE8DE" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(27,24,20,0.06), 0 4px 16px -4px rgba(27,24,20,0.10)",
        pop: "0 2px 6px rgba(27,24,20,0.10), 0 12px 32px -8px rgba(27,24,20,0.22)",
      },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
