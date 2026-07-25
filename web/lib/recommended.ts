// Lugares recomendados: parcelas reales sobre zonas agrícolas de Colombia.
// Solo coordenadas y contexto — el análisis siempre es en vivo contra
// Sentinel-2. Mismo contenido que sirve GET /parcels del backend.

import parcelsJson from "./parcels.json";
import type { Recommended } from "./types";

export const RECOMMENDED: Recommended[] = (parcelsJson.features as any[]).map(
  (feat) => ({
    id: feat.properties.id,
    name: feat.properties.name,
    crop: feat.properties.crop,
    region: feat.properties.region,
    geometry: feat.geometry,
  })
);
