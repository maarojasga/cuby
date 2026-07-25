"""CLI.

    python -m ingest hydrate aois.geojson --start 2021-01-01 --end 2026-07-01
    python -m ingest smoke
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

from .cache import DEFAULT_CACHE_ROOT
from .cube import DEFAULT_BANDS, get_cube

log = logging.getLogger("ingest")


def _features(path: Path) -> list[dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("type") == "FeatureCollection":
        return data["features"]
    if data.get("type") == "Feature":
        return [data]
    return [{"type": "Feature", "properties": {}, "geometry": data}]


def hydrate(args: argparse.Namespace) -> int:
    if not args.geojson.exists():
        print(f"No existe el archivo: {args.geojson}", file=sys.stderr)
        return 2
    try:
        feats = _features(args.geojson)
    except json.JSONDecodeError as exc:
        print(f"{args.geojson} no es JSON válido: {exc}", file=sys.stderr)
        return 2
    if not feats:
        print(f"{args.geojson} no tiene features", file=sys.stderr)
        return 2

    print(f"{len(feats)} polígonos en {args.geojson}")

    ok, failed = 0, []
    for i, feat in enumerate(feats, start=1):
        label = (feat.get("properties") or {}).get("name") or f"#{i}"
        t0 = time.time()
        try:
            cube = get_cube(
                feat,
                args.start,
                args.end,
                collection=args.collection,
                bands=args.bands,
                resolution=args.resolution,
                cache_root=args.cache_root,
                refresh=args.refresh,
            )
            n_t = cube.sizes.get("time", 0)
            vf = float(cube["valid_fraction"].mean().compute())
            print(
                f"  [{i}/{len(feats)}] {label}: {n_t} fechas, "
                f"validez media {vf:.0%}, {time.time() - t0:.1f}s"
            )
            ok += 1
        except Exception as exc:  # un polígono caído no tumba la corrida
            failed.append((label, exc))
            print(f"  [{i}/{len(feats)}] {label}: FALLÓ -> {exc}", file=sys.stderr)

    print(f"\nListos {ok}/{len(feats)}")
    if failed:
        print("Fallidos:")
        for label, exc in failed:
            print(f"  - {label}: {type(exc).__name__}: {exc}")
    return 0 if not failed else 1


def smoke(args: argparse.Namespace) -> int:
    """El paso más pequeño posible: valida red, credenciales y firma de URLs.

    Esto es lo primero que se corre. Si falla acá, no es tu lógica: es el
    catálogo, la firma o la red — y es donde se pierde la primera hora si se
    deja para después.
    """
    from .catalog import search_items

    bbox = (-74.95, 4.40, -74.93, 4.42)  # un rectangulito, Tolima/Cundinamarca
    items = search_items(bbox, "2024-01-01", "2024-02-01")
    print(f"items encontrados: {len(items)}")
    if not items:
        print("Sin items: revisá el rango o el bbox")
        return 1

    import odc.stac

    ds = odc.stac.load(items[:1], bands=["red"], crs="utm", resolution=10, bbox=bbox)
    print("shape:", dict(ds.sizes))
    print("dtype:", ds["red"].dtype)
    print("rango:", int(ds["red"].min()), int(ds["red"].max()))
    return 0


def main(argv: list[str] | None = None) -> int:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-v", "--verbose", action="store_true")

    parser = argparse.ArgumentParser(prog="ingest", description="Capa de ingesta")
    sub = parser.add_subparsers(dest="cmd", required=True)

    h = sub.add_parser(
        "hydrate",
        parents=[common],
        help="Construye los cubos de un GeoJSON",
    )
    h.add_argument("geojson", type=Path)
    h.add_argument("--start", required=True)
    h.add_argument("--end", required=True)
    h.add_argument("--collection", default="sentinel-2-l2a")
    h.add_argument("--bands", nargs="+", default=list(DEFAULT_BANDS))
    h.add_argument("--resolution", type=int, default=10)
    h.add_argument("--cache-root", type=Path, default=DEFAULT_CACHE_ROOT)
    h.add_argument("--refresh", action="store_true")
    h.set_defaults(func=hydrate)

    s = sub.add_parser(
        "smoke",
        parents=[common],
        help="Prueba mínima de red, firma y carga",
    )
    s.set_defaults(func=smoke)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    # botocore loguea "Found credentials..." por cada hilo de descarga y
    # entierra los logs propios. Solo interesan sus warnings.
    for noisy in ("botocore", "boto3", "urllib3", "rasterio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    try:
        return args.func(args)
    except KeyboardInterrupt:
        # La escritura es atómica: interrumpir deja a lo sumo un .tmp inerte,
        # nunca un caché corrupto. Se puede reanudar con el mismo comando.
        print("\nInterrumpido. Los cubos ya completos quedan en caché.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
