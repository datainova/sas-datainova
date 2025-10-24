import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2d2926",
          foreground: "#ffffff",
          muted: "#f5f4f3"
        },
        background: "#ffffff",
        foreground: "#2d2926",
        success: "#1a7f37",
        warning: "#b86e00",
        danger: "#b3261e"
      },
      fontFamily: {
        display: ["\"Jaapokki\"", "\"Exo 2\"", "system-ui", "sans-serif"],
        sans: ["\"Exo 2\"", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 16px 40px rgba(0,0,0,0.12)"
      },
      borderRadius: {
        xl: "20px",
        lg: "16px",
        md: "12px",
        sm: "8px"
      }
    }
  },
  plugins: []
};

export default config;
