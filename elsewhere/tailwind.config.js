/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4F5D3F",
        secondary: "#8C9F7B",
        accent: "#3E4F73",
        background: "#EFEBE0",
        surface: "#FCF9F4",
        "surface-alt-border": "#D2D4C7",
        "surface-chip": "#D8D3C6",
        "header-bg": "#4F5D3F",
        "header-selected-overlay": "rgba(255, 255, 255, 0.15)",
        text: "#2F2F2F",
        "text-secondary": "#6B6A62",
        "text-tertiary": "#9B9A91",
        "text-inverse": "#FFFFFF",
        "status-high": "#4F5D3F",
        "status-medium": "#C4943A",
        "status-low": "#A85C3A",
      },
      borderRadius: {
        "radius-sm": "8px",
        "radius-md": "16px",
      },
      spacing: {
        4: "4px",
        8: "8px",
        12: "12px",
        16: "16px",
        20: "20px",
        24: "24px",
        32: "32px",
        40: "40px",
      },
      zIndex: {
        10: "10",
        20: "20",
        30: "30",
        40: "40",
        50: "50",
      },
      boxShadow: {
        map: "0 2px 8px rgba(47,47,47,0.5)",
      },
      backgroundImage: {
        "image-overlay":
          "linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.55) 100%)",
      },
      fontFamily: {
        lora: ["var(--font-lora)", "serif"],
        sans: ["var(--font-dm-sans)", "sans-serif"],
        "dm-sans": ["var(--font-dm-sans)", "sans-serif"],
      },
    },
  },
  plugins: [
    function ({ addUtilities, addBase, theme }) {
      const lora = theme("fontFamily.lora");
      const sans = theme("fontFamily.sans");

      addBase({
        body: {
          backgroundColor: theme("colors.background"),
          color: theme("colors.text"),
        },
      });

      addUtilities({
        ".overlay-gradient": {
          position: "absolute",
          inset: 0,
          backgroundImage: theme("backgroundImage.image-overlay"),
          pointerEvents: "none",
        },
        ".scrollbar-hide": {
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
        // Lora — display and headings only
        ".text-display-xl": {
          fontFamily: lora,
          fontSize: "48px",
          lineHeight: "56px",
          fontWeight: "700",
        },
        ".text-display-l": {
          fontFamily: lora,
          fontSize: "32px",
          lineHeight: "40px",
          fontWeight: "700",
        },
        ".text-heading-xl": {
          fontFamily: lora,
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
        },
        ".text-heading-l": {
          fontFamily: lora,
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: "700",
        },
        ".text-heading-m": {
          fontFamily: lora,
          fontSize: "20px",
          lineHeight: "28px",
          fontWeight: "700",
        },
        ".text-heading-s": {
          fontFamily: lora,
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: "700",
        },
        ".text-heading-italic": {
          fontFamily: lora,
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: "700",
          fontStyle: "italic",
        },
        // DM Sans — body, labels, buttons, captions only
        ".text-body-l": {
          fontFamily: sans,
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: "400",
        },
        ".text-body-m": {
          fontFamily: sans,
          fontSize: "14px",
          lineHeight: "24px",
          fontWeight: "400",
        },
        ".text-body-s": {
          fontFamily: sans,
          fontSize: "12px",
          lineHeight: "20px",
          fontWeight: "400",
        },
        ".text-ui-button": {
          fontFamily: sans,
          fontSize: "16px",
          lineHeight: "20px",
          fontWeight: "700",
        },
        ".text-ui-label-l": {
          fontFamily: sans,
          fontSize: "16px",
          lineHeight: "20px",
          fontWeight: "700",
        },
        ".text-ui-label-m": {
          fontFamily: sans,
          fontSize: "12px",
          lineHeight: "16px",
          fontWeight: "700",
        },
        ".text-ui-label-s": {
          fontFamily: sans,
          fontSize: "10px",
          lineHeight: "14px",
          fontWeight: "700",
        },
        ".text-ui-caption": {
          fontFamily: sans,
          fontSize: "12px",
          lineHeight: "20px",
          fontWeight: "400",
        },
        ".text-ui-overline": {
          fontFamily: sans,
          fontSize: "10px",
          lineHeight: "14px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.025em",
        },
      });
    },
  ],
};
