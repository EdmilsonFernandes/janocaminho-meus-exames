"""
generate_examples.py — Gera um exemplo de saída por condição (Task #5 / entregáveis).

Roda o risk_service.assess() completo sobre casos sintéticos realistas (1 por condição)
e salva examples/*.json. Serve também como teste de fumaça ponta-a-ponta.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from src import risk_service  # noqa: E402

# 1 caso por condição. Valores na unidade PADRÃO; nomes em PT/EN/abrev p/ exercitar normalize.
CASES = {
    "diabetes": [
        {"name": "Glicemia de jejum", "value": 168, "unit": "mg/dL"},
        {"name": "Hemoglobina Glicada", "value": 8.1, "unit": "%"},
        {"name": "Pressão sistólica", "value": 118, "unit": "mmHg"},
        {"name": "Pressão diastólica", "value": 75, "unit": "mmHg"},
        {"name": "LDL", "value": 110, "unit": "mg/dL"},
        {"name": "HDL", "value": 52, "unit": "mg/dL"},
        {"name": "Triglicerídeos", "value": 120, "unit": "mg/dL"},
        {"name": "Hemoglobina", "value": 14.0, "unit": "g/dL"},
        {"name": "VCM", "value": 88, "unit": "fL"},
    ],
    "anemia": [
        {"name": "Blood Glucose", "value": 92, "unit": "mg/dL"},
        {"name": "A1C", "value": 5.2, "unit": "%"},
        {"name": "Systolic BP", "value": 115, "unit": "mmHg"},
        {"name": "Diastolic BP", "value": 72, "unit": "mmHg"},
        {"name": "Colesterol LDL", "value": 100, "unit": "mg/dL"},
        {"name": "Colesterol HDL", "value": 50, "unit": "mg/dL"},
        {"name": "Triglycerides", "value": 110, "unit": "mg/dL"},
        {"name": "Haemoglobin", "value": 9.5, "unit": "g/dL"},
        {"name": "MCV", "value": 68, "unit": "fL"},
    ],
    "hypertension": [
        {"name": "Glicose", "value": 95, "unit": "mg/dL"},
        {"name": "HbA1C", "value": 5.3, "unit": "%"},
        {"name": "PAS", "value": 152, "unit": "mmHg"},
        {"name": "PAD", "value": 98, "unit": "mmHg"},
        {"name": "LDL Colesterol", "value": 105, "unit": "mg/dL"},
        {"name": "HDL Colesterol", "value": 48, "unit": "mg/dL"},
        {"name": "Triglicerídeos", "value": 130, "unit": "mg/dL"},
        {"name": "Hemoglobina", "value": 14.2, "unit": "g/dL"},
        {"name": "Volume Corpuscular Médio", "value": 89, "unit": "fL"},
    ],
    "high_cholesterol": [
        {"name": "Glicemia", "value": 98, "unit": "mg/dL"},
        {"name": "Hemoglobina Glicada", "value": 5.4, "unit": "%"},
        {"name": "Systolic", "value": 120, "unit": "mmHg"},
        {"name": "Diastolic", "value": 78, "unit": "mmHg"},
        {"name": "LDL", "value": 190, "unit": "mg/dL"},
        {"name": "HDL", "value": 35, "unit": "mg/dL"},
        {"name": "Triglicerídeos", "value": 260, "unit": "mg/dL"},
        {"name": "Hemoglobina", "value": 14.5, "unit": "g/dL"},
        {"name": "VCM", "value": 90, "unit": "fL"},
    ],
    "fit": [
        {"name": "Glicose", "value": 88, "unit": "mg/dL"},
        {"name": "HbA1C", "value": 5.1, "unit": "%"},
        {"name": "Systolic BP", "value": 112, "unit": "mmHg"},
        {"name": "Diastolic BP", "value": 70, "unit": "mmHg"},
        {"name": "LDL", "value": 95, "unit": "mg/dL"},
        {"name": "HDL", "value": 55, "unit": "mg/dL"},
        {"name": "Triglycerides", "value": 90, "unit": "mg/dL"},
        {"name": "Haemoglobin", "value": 14.8, "unit": "g/dL"},
        {"name": "MCV", "value": 88, "unit": "fL"},
    ],
    # exercita conversão de unidade (mmol/L -> mg/dL) + pré-diabetes
    "prediabetes_mmol": [
        {"name": "Glucose", "value": 6.3, "unit": "mmol/L"},   # ~113 mg/dL
        {"name": "Hemoglobina Glicada", "value": 5.9, "unit": "%"},
        {"name": "Pressão sistólica", "value": 122, "unit": "mmHg"},
        {"name": "Pressão diastólica", "value": 76, "unit": "mmHg"},
        {"name": "LDL", "value": 118, "unit": "mg/dL"},
        {"name": "HDL", "value": 58, "unit": "mg/dL"},
        {"name": "Triglicerídeos", "value": 100, "unit": "mg/dL"},
        {"name": "Hemoglobina", "value": 13.8, "unit": "g/dL"},
        {"name": "MCV", "value": 87, "unit": "fL"},
    ],
}


def main() -> None:
    out_dir = Path(__file__).resolve().parent
    bundle = {}
    for name, markers in CASES.items():
        res = risk_service.assess(markers)
        bundle[name] = res
        path = out_dir / f"example_{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
        print(f"[{name:18s}] risk={res['riskLevel']:9s} cond={res['predictedConditionKey']:18s} "
              f"basis={res['basis']:8s} mlAgrees={res['mlAgreesWithRules']} -> {path.name}")

    with open(out_dir / "all_examples.json", "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    print("\nOK — exemplos gerados em", out_dir)


if __name__ == "__main__":
    main()
