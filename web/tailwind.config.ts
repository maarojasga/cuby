import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // MODO OSCURO — fondo azul espacial del home; botones en blanco cálido.
        cream: "#010a12", // fondo base (mismo azul del home). También = texto
        //                    oscuro sobre los botones claros (text-cream).
        card: "#0C1428", // superficie / tarjeta (navy oscuro, elevada)
        line: {
          DEFAULT: "#26314C", // borde sobre superficie oscura
          soft: "#1A2338", // hairline aún más tenue (grid)
        },
        forest: {
          DEFAULT: "#F9F6EE", // blanco cálido: botones / identidad / toggle
          600: "#689149", // verde vegetación (acento / bueno)
        },
        ocean: "#7C8AD9", // navy aclarado — datos / agua (legible en oscuro)
        ink: {
          primary: "#F2EFE6", // texto claro
          secondary: "#AEB6C2",
          muted: "#7C8695",
        },
        // Índices espectrales (aclarados para leerse sobre oscuro)
        ndvi: "#689149", // biomasa / salud (verde)
        ndmi: "#7C8AD9", // humedad / agua (azul)
        ndre: "#D97706", // clorofila / alerta temprana (ámbar)
        // Estado / riesgo (ámbar y rojo reservados por significado)
        risk: {
          bajo: "#689149",
          medio: "#D97706",
          alto: "#DC2626",
        },
      },
      boxShadow: {
        // Elevación en oscuro: sombras más marcadas sobre el fondo profundo.
        card: "0 1px 2px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.4)",
        soft: "0 1px 2px rgba(0,0,0,0.45)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
