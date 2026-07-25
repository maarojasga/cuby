import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta: navy + verde sobre blanco cálido
        cream: "#F9F6EE", // fondo base (pantalla)
        card: "#FFFFFF", // superficies / tarjetas
        line: {
          DEFAULT: "#E6E0D2", // borde suave
          soft: "#F1ECE0", // hairline aún más tenue (grid)
        },
        forest: {
          DEFAULT: "#222D67", // navy profundo (identidad / acciones)
          600: "#689149", // verde vegetación (acento / bueno)
        },
        ocean: "#222D67", // navy — datos / agua
        ink: {
          primary: "#171009", // neutro cálido muy oscuro
          secondary: "#4F4A40",
          muted: "#8C857A",
        },
        // Índices espectrales
        ndvi: "#689149", // biomasa / salud (verde)
        ndmi: "#222D67", // humedad / agua (navy)
        ndre: "#D97706", // clorofila / alerta temprana (ámbar)
        // Estado / riesgo (ámbar y rojo reservados por significado)
        risk: {
          bajo: "#689149",
          medio: "#D97706",
          alto: "#DC2626",
        },
      },
      boxShadow: {
        // Elevación limpia sin sombras pesadas (tono cálido de la paleta)
        card: "0 1px 2px rgba(18,5,0,0.05), 0 6px 16px rgba(18,5,0,0.06)",
        soft: "0 1px 2px rgba(18,5,0,0.05)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
