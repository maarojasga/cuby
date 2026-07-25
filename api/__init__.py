"""Capa de API — expone score y alertas por HTTP.

Vive al lado de `analysis`, lee el cubo a través de `ingest` y sirve el JSON
que consume el frontend. Es la única capa que sabe de HTTP.
"""
