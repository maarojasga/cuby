"use client";

import { useEffect, useRef } from "react";
import type { ParcelSummary } from "@/lib/types";
import { riskColor } from "@/lib/ui";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

type Props = {
  parcels: ParcelSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDraw: (geometry: GeoJSON.Polygon) => void;
  drawing: boolean;
};

// Mapa satelital con parcelas seleccionables y dibujo de polígonos.
// Usa Leaflet directo (sin react-leaflet) para no atarse a versiones y para
// controlar el ciclo de vida a mano dentro de un único efecto.
export default function ParcelMap({
  parcels,
  selectedId,
  onSelect,
  onDraw,
  drawing,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<Record<string, any>>({});
  const drawnRef = useRef<any>(null);
  const drawControlRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // Mantener callbacks frescos sin recrear el mapa.
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
        center: [3.9, -74.5],
        zoom: 6,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
        }
      ).addTo(map);

      // Etiquetas de referencia por encima del satélite.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, opacity: 0.7 }
      ).addTo(map);

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      drawnRef.current = drawnItems;

      map.on((L as any).Draw.Event.CREATED, (e: any) => {
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);
        const gj = e.layer.toGeoJSON();
        onDrawRef.current(gj.geometry as GeoJSON.Polygon);
      });

      renderParcels();
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

  // --- render/refresh de parcelas y selección ---
  function renderParcels() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    Object.values(layersRef.current).forEach((l: any) => map.removeLayer(l));
    layersRef.current = {};

    const bounds: any[] = [];
    parcels.forEach((p) => {
      const isSel = p.id === selectedId;
      const color = riskColor(p.risk_level);
      const layer = L.geoJSON(
        { type: "Feature", geometry: p.geometry, properties: {} } as any,
        {
          style: {
            color,
            weight: isSel ? 3 : 2,
            fillColor: color,
            fillOpacity: isSel ? 0.35 : 0.15,
          },
        }
      );
      layer.on("click", () => onSelectRef.current(p.id));
      layer.bindTooltip(
        `${p.name} · ${p.score}/100`,
        { sticky: true, direction: "top" }
      );
      layer.addTo(map);
      layersRef.current[p.id] = layer;
      layer.eachLayer((sub: any) => bounds.push(sub.getBounds()));
    });

    if (selectedId && layersRef.current[selectedId]) {
      map.fitBounds(layersRef.current[selectedId].getBounds().pad(1.2), {
        maxZoom: 15,
      });
    } else if (bounds.length) {
      let b = bounds[0];
      bounds.slice(1).forEach((x) => (b = b.extend(x)));
      map.fitBounds(b.pad(0.3));
    }
  }

  useEffect(() => {
    renderParcels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcels, selectedId]);

  // --- toggle del control de dibujo ---
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (drawing && !drawControlRef.current) {
      const dc = new (L as any).Draw.Polygon(map, {
        shapeOptions: { color: "#eda100", weight: 2 },
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
