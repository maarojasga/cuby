import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm Organic AgTech
        cream: "#FCF2DF", // fondo base (pantalla)
        card: "#FFFFFF", // superficies / tarjetas
        line: {
          DEFAULT: "#E7DBC3", // borde suave sobre crema
          soft: "#EFE6D3", // hairline aún más tenue (grid)
        },
        forest: {
          DEFAULT: "#1B4D3E", // verde bosque profundo (identidad)
          600: "#2D6A4F", // verde vegetación (acciones / bueno)
        },
        ocean: "#2A6F97", // acento satelital / datos
        ink: {
          primary: "#1C1917", // pizarra cálida
          secondary: "#57534E",
          muted: "#8A8072",
        },
        // Índices espectrales
        ndvi: "#2D6A4F", // biomasa / salud
        ndmi: "#2A6F97", // humedad / agua
        ndre: "#D97706", // clorofila / alerta temprana
        // Estado / riesgo
        risk: {
          bajo: "#2D6A4F",
          medio: "#D97706",
          alto: "#DC2626",
        },
      },
      boxShadow: {
        // Elevación limpia sin sombras pesadas
        card: "0 1px 2px rgba(28,25,23,0.04), 0 6px 16px rgba(28,25,23,0.05)",
        soft: "0 1px 2px rgba(28,25,23,0.04)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
