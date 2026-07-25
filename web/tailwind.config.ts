import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Superficies (paleta validada, tema oscuro por defecto del producto)
        surface: {
          page: "#0b0f0d",
          panel: "#12181500",
          card: "#141b18",
          ring: "rgba(255,255,255,0.08)",
        },
        ink: {
          primary: "#f4f6f4",
          secondary: "#a9b3ac",
          muted: "#6f7a72",
        },
        // Índices espectrales
        ndvi: "#1baf7a",
        ndmi: "#3987e5",
        ndre: "#eb6834",
        // Estado / riesgo
        risk: {
          bajo: "#0ca30c",
          medio: "#fab219",
          alto: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
