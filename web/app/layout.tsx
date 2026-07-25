import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuby — Score de Riesgo Verde & Alertas Tempranas",
  description:
    "Análisis de parcelas agrícolas con Sentinel-2. Score crediticio para financieras y alertas tempranas para el agricultor.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
