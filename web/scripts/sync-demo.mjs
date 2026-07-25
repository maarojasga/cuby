// Copia los reportes de demo del backend (api/demo) al bundle del frontend
// (public/demo), para que Vercel los sirva como fallback sin backend.
//
//   npm run sync-demo
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "api", "demo");
const dst = join(here, "..", "public", "demo");

if (!existsSync(src)) {
  console.error(`No existe ${src}. Corré antes: python scripts/build_demo_reports.py`);
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`Demo sincronizada: ${src} -> ${dst}`);
