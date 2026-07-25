"use client";

import { useEffect, useRef } from "react";
import type { Recommended } from "@/lib/types";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

const OCEAN = "#222D67"; // recomendaciones (navy)
const FOREST = "#689149"; // selección / parcela activa (verde, contrasta)

type Props = {
  recs: Recommended[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDraw: (geometry: GeoJSON.Polygon) => void;
  drawing: boolean;
  highlight?: GeoJSON.Polygon | null; // parcela dibujada / por coordenadas
};

// Mapa satelital con lugares recomendados, dibujo de polígonos y una
// geometría destacada. Leaflet directo, ciclo de vida en un solo efecto.
export default function ParcelMap({
  recs,
  selectedId,
  onSelect,
  onDraw,
  drawing,
  highlight,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({});
  const highlightRef = useRef<any>(null);
  const drawnRef = useRef<any>(null);
  const drawControlRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const onSelectRef = useRef(onSelect);
  const onDrawRef = useRef(onDraw);
  onSelectRef.current = onSelect;
  onDrawRef.current = onDraw;

  // --- init (una vez) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet-draw");
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        center: [4.3, -74.3],
        zoom: 6,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, opacity: 0.7 }
      ).addTo(map);

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      drawnRef.current = drawnItems;

      map.on((L as any).Draw.Event.CREATED, (e: any) => {
        const gj = e.layer.toGeoJSON();
        // La geometría viaja al estado y vuelve como `highlight`:
        // una sola fuente de verdad, sin capa duplicada.
        drawnItems.clearLayers();
        onDrawRef.current(gj.geometry as GeoJSON.Polygon);
      });

      render();
      setTimeout(() => map.invalidateSize(), 100);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- recomendaciones + selección + highlight ---
  function render() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    Object.values(layersRef.current).forEach((l: any) => map.removeLayer(l));
    layersRef.current = {};
    if (highlightRef.current) {
      map.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }

    const allBounds: any[] = [];

    recs.forEach((p) => {
      const isSel = p.id === selectedId;
      const color = isSel ? FOREST : OCEAN;
      const layer = L.geoJSON(
        { type: "Feature", geometry: p.geometry, properties: {} } as any,
        {
          style: {
            color,
            weight: isSel ? 3 : 2,
            fillColor: color,
            fillOpacity: isSel ? 0.3 : 0.12,
          },
        }
      );
      layer.on("click", () => onSelectRef.current(p.id));
      layer.bindTooltip(`${p.name} · ${p.crop}`, { sticky: true, direction: "top" });
      layer.addTo(map);
      layersRef.current[p.id] = layer;
      layer.eachLayer((sub: any) => allBounds.push(sub.getBounds()));
    });

    if (highlight) {
      const hl = L.geoJSON(
        { type: "Feature", geometry: highlight, properties: {} } as any,
        {
          style: {
            color: FOREST,
            weight: 3,
            fillColor: FOREST,
            fillOpacity: 0.28,
          },
        }
      );
      hl.addTo(map);
      highlightRef.current = hl;
    }

    // Encuadre: la geometría activa manda; si no, todas las recomendaciones.
    if (highlight && highlightRef.current) {
      map.fitBounds(highlightRef.current.getBounds().pad(1.0), { maxZoom: 15 });
    } else if (selectedId && layersRef.current[selectedId]) {
      map.fitBounds(layersRef.current[selectedId].getBounds().pad(1.2), {
        maxZoom: 15,
      });
    } else if (allBounds.length) {
      let b = allBounds[0];
      allBounds.slice(1).forEach((x) => (b = b.extend(x)));
      map.fitBounds(b.pad(0.3));
    }
  }

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, selectedId, highlight]);

  // --- control de dibujo ---
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (drawing && !drawControlRef.current) {
      const dc = new (L as any).Draw.Polygon(map, {
        shapeOptions: { color: OCEAN, weight: 2 },
        allowIntersection: false,
      });
      dc.enable();
      drawControlRef.current = dc;
    } else if (!drawing && drawControlRef.current) {
      drawControlRef.current.disable();
      drawControlRef.current = null;
    }
  }, [drawing]);

  return <div ref={containerRef} className="h-full w-full" />;
}
