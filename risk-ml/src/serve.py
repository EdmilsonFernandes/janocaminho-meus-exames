"""
serve.py — Endpoint INTERNO de inferência (Task #10).

Microserviço Python que o servidor Node (packages/server) chama após extrair os
valores do PDF. Recebe os marcadores brutos, devolve o JSON estruturado de risco.

Rodar:
  pip install fastapi uvicorn[standard] pydantic
  uvicorn src.serve:app --port 4051 --host 127.0.0.1

  (porta 4051 p/ não colidir com backend 4001 / dev 4011)

Segurança: ouvir só em 127.0.0.1 (interno). Em prod, atrás do mesmo docker network
do backend, sem exposição pública. PHI não sai do cluster (o modelo roda local).
"""
from __future__ import annotations
from typing import Optional
from fastapi import FastAPI
from pydantic import BaseModel, Field

from . import risk_service

app = FastAPI(title="Dr. Exame — Risk ML (interno)", version="1.0.0")


class MarkerIn(BaseModel):
    name: str
    value: float
    unit: Optional[str] = None


class AssessIn(BaseModel):
    markers: list[MarkerIn]
    sex: Optional[str] = Field(default=None, description="male | female")
    snapshotContext: Optional[str] = Field(default=None, description="contexto do health-state p/ GLM")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "module": "risk-ml"}


@app.post("/assess")
def assess(body: AssessIn) -> dict:
    """Avaliação de risco estruturada (regras primárias + ML 2ª opinião)."""
    return risk_service.assess(
        [m.model_dump() for m in body.markers],
        sex=body.sex,
        glm_explain=True,
        snapshot_context=body.snapshotContext or "",
    )


# Exemplo de chamada do servidor Node (fetch interno):
#   POST http://127.0.0.1:4051/assess
#   { "markers": [ {"name":"Glicemia de jejum","value":168,"unit":"mg/dL"}, ... ] }
