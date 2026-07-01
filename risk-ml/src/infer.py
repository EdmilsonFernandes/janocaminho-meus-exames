"""
infer.py — Inferência do modelo ML (SEGUNDA OPINIAO).

Carrega o pipeline RandomForest (sklearn) treinado por train.py e devolve
predictedCondition + confianca + probabilidades. Por design, o modelo APENAS
corrobora a camada de regras; nunca é a fonte única de risco.

AVISO DE SEGURANCA (gravado no model_meta):
  O modelo foi treinado em dados SINTETICOS/baseados-em-regras (acuracia ~100%
  que NAO generaliza). Por isso:
    - `reliable=False` por padrao; o orquestrador so eleva a 'reliable' quando
      o modelo CONCORDA com a camada de regras.
    - `confidence` vem de predict_proba, mas truncado e acompanhado de `margin`
      (top1-top2): margem baixa => caso próximo de fronteira => menos confiável.
    - O modelo NAO distingue pré-diabetes (o dataset rotulava como "Fit").
"""
from __future__ import annotations
import math
from pathlib import Path
from typing import Optional
import joblib
import pandas as pd

_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
_pipe = None
_meta = None

# canonical (snake, das regras) -> coluna do dataset (PascalCase)
_CANON2COL = {
    "blood_glucose": "Blood_glucose", "hba1c": "HbA1C",
    "systolic_bp": "Systolic_BP", "diastolic_bp": "Diastolic_BP",
    "ldl": "LDL", "hdl": "HDL", "triglycerides": "Triglycerides",
    "haemoglobin": "Haemoglobin", "mcv": "MCV",
}
# rótulo do dataset -> chave de condição (snake) usada pelo app
_LABEL2COND = {
    "Diabetes": "diabetes", "Hypertension": "hypertension",
    "High_Cholesterol": "high_cholesterol", "Anemia": "anemia", "Fit": "none",
}
# abaixo desta margem top1-top2 consideramos o caso "próximo de fronteira"
LOW_MARGIN = 0.20


def _load():
    global _pipe, _meta
    if _pipe is None:
        _pipe = joblib.load(_MODEL_DIR / "rf_pipeline.joblib")
        _meta = joblib.load(_MODEL_DIR / "model_meta.joblib")
    return _pipe, _meta


def predict(values: dict[str, float]) -> dict:
    """values: {canonical: valor} já na unidade padrão. Faltantes -> imputados.

    Retorna {predictedCondition, confidence, margin, reliable, probabilities,
             conditions_present, ml_note}.
    """
    pipe, meta = _load()
    row = {col: values.get(canon) for canon, col in _CANON2COL.items()}
    X = pd.DataFrame([row], columns=meta["features"])
    pred_label = pipe.predict(X)[0]
    proba = pipe.predict_proba(X)[0]
    classes = list(pipe.classes_)
    pairs = sorted(zip(classes, proba), key=lambda x: -x[1])
    top1_label, top1_p = pairs[0]
    top2_p = pairs[1][1] if len(pairs) > 1 else 0.0
    margin = float(top1_p - top2_p)

    predicted = _LABEL2COND.get(top1_label, "none")
    # n presente (não-imputado) entre as 9 features
    present = sum(1 for v in row.values() if v is not None and not (isinstance(v, float) and math.isnan(v)))

    return {
        "predictedCondition": predicted,
        "confidence": round(float(top1_p), 4),
        "margin": round(margin, 4),
        "reliable": bool(margin >= LOW_MARGIN and present >= 5),
        "probabilities": {_LABEL2COND.get(c, c): round(float(p), 4) for c, p in pairs},
        "conditions_present": present,
        "ml_note": "Modelo treinado em dados sintéticos (2ª opinião; não diagnóstico).",
    }


if __name__ == "__main__":  # smoke: mesmo caso diabético do rules_engine
    sample = {
        "blood_glucose": 168.0, "hba1c": 8.1,
        "systolic_bp": 118.0, "diastolic_bp": 75.0,
        "ldl": 110.0, "hdl": 52.0, "triglycerides": 120.0,
        "haemoglobin": 14.0, "mcv": 88.0,
    }
    import json
    print(json.dumps(predict(sample), ensure_ascii=False, indent=2))
