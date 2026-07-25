import Dashboard from "@/components/Dashboard";

// /panel?modo=credito | /panel?modo=agricultor — los botones del home fijan
// la vista inicial; el toggle del header sigue permitiendo cambiar.
export default function PanelPage({
  searchParams,
}: {
  searchParams?: { modo?: string };
}) {
  const initialMode = searchParams?.modo === "agricultor" ? "agricultor" : "credito";
  return <Dashboard initialMode={initialMode} />;
}
