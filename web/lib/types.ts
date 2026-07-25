// Espejo del JSON que produce el backend (analysis/report.py).

export type SeriesPoint = { date: string; value: number };

export type ScoreComponents = {
  productividad: number;
  estabilidad: number;
  regularidad: number;
  cobertura: number;
};

export type GreenScore = {
  score: number;
  risk_band: string;
  risk_level: "bajo" | "medio" | "alto" | "sin_datos";
  components: ScoreComponents;
  metrics: Record<string, any>;
  rationale: string[];
};

export type CropCheck = {
  is_cultivated: boolean;
  pattern: string;
  label: string;
  confidence: number;
  detail: string;
  features: Record<string, number>;
};

export type Alert = {
  tipo: "estres_hidrico" | "estres_vegetal" | "estres_clorofila";
  severidad: "media" | "alta";
  indice: "NDVI" | "NDMI" | "NDRE";
  fecha: string;
  valor_actual: number;
  valor_referencia: number | null;
  caida_pct: number | null;
  mensaje: string;
};

export type AlertReport = {
  parcela: string;
  estado: "ok" | "alerta";
  evaluado_hasta: string | null;
  alertas: Alert[];
  ultimos_valores: Record<string, number>;
};

// Grilla por píxel de las últimas lecturas, para el relieve 3D.
export type SurfaceData = {
  index: string;
  dates: string[];
  frames: (number | null)[][][]; // [frame][fila][columna], null fuera del lote
  north: "first_row" | "last_row";
};

export type Report = {
  parcela: string;
  parcel_id: string | null;
  meta: {
    crop?: string;
    region?: string;
    geometry?: GeoJSON.Polygon;
    source?: string;
    start?: string;
    end?: string;
    interval_days?: number;
    [k: string]: any;
  };
  series: {
    ndvi: SeriesPoint[];
    ndmi: SeriesPoint[];
    ndre: SeriesPoint[];
  };
  surface?: SurfaceData | null;
  credito: {
    score: GreenScore;
    verificacion_cultivo: CropCheck;
  };
  alertas: AlertReport;
  cobertura: {
    n_fechas: number;
    validez_media: number | null;
  };
};

// Lugar recomendado: solo coordenadas y contexto, el análisis es en vivo.
export type Recommended = {
  id: string;
  name: string;
  crop: string;
  region: string;
  geometry: GeoJSON.Polygon;
};
