import type { Config } from "tailwindcss";

// Los colores se leen de variables CSS (globals.css) que cambian con la clase
// `.dark` en <html>. Así un solo toggle intercambia todo el tema en vivo.
// Formato rgb(var(--x) / <alpha-value>) para que los modificadores /opacity
// (bg-forest/10, border-line/40, …) sigan funcionando.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: v("--page"), // fondo de pantalla
        card: v("--card"), // superficies / tarjetas
        line: { DEFAULT: v("--line"), soft: v("--line-soft") },
        forest: { DEFAULT: v("--brand"), 600: v("--green") }, // identidad + verde
        ocean: v("--data"), // datos / agua
        ink: { primary: v("--ink"), secondary: v("--ink2"), muted: v("--ink3") },
        // Índices espectrales
        ndvi: v("--green"),
        ndmi: v("--data"),
        ndre: v("--amber"),
        // Estado / riesgo
        risk: { bajo: v("--green"), medio: v("--amber"), alto: v("--red") },
        // Auxiliares de tema
        track: v("--track"), // pistas de barras / gauge / grid
        btnink: v("--btnink"), // texto sobre botones de marca
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
