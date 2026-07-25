"use client";

// Sistema de tema claro/oscuro para el panel.
//
// Los colores de superficie/texto/borde viven como variables CSS que cambian
// con la clase `.dark` en <html> (ver globals.css + tailwind.config). Este
// módulo maneja el estado, lo persiste y expone el botón de cambio. Los colores
// que Recharts/Three necesitan como valor JS (no como var CSS) se derivan con
// `chartTheme` / `useIndexColors`.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // El script anti-flash de layout ya puso la clase; leemos de ahí.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      const root = document.documentElement;
      root.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* almacenamiento no disponible */
      }
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

export function useIsDark() {
  return useContext(ThemeCtx).theme === "dark";
}

// Botón sol/luna.
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-base shadow-soft transition hover:border-forest/40"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

// Colores que Recharts/Three necesitan como string/número JS (no var CSS).
export function chartTheme(dark: boolean) {
  return dark
    ? {
        grid: "#202A44",
        axis: "#7C8695",
        axisLine: "#26314C",
        tooltipBg: "#0C1428",
        tooltipBorder: "#26314C",
        tooltipShadow: "0 8px 24px rgba(0,0,0,0.5)",
        ink: "#F2EFE6",
        ink2: "#AEB6C2",
        pedestal: 0x111a30,
      }
    : {
        grid: "#EFE9DE",
        axis: "#8C857A",
        axisLine: "#E6E0D2",
        tooltipBg: "#FFFFFF",
        tooltipBorder: "#E6E0D2",
        tooltipShadow: "0 6px 16px rgba(18,5,0,0.08)",
        ink: "#171009",
        ink2: "#4F4A40",
        pedestal: 0xede7d8,
      };
}

// NDVI y NDRE son iguales en ambos temas; NDMI (azul) se aclara en oscuro.
export function useIndexColors() {
  const dark = useIsDark();
  return {
    ndvi: "#689149",
    ndmi: dark ? "#7C8AD9" : "#222D67",
    ndre: "#D97706",
  } as const;
}
