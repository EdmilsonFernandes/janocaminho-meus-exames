"""
test_rules.py — Testes de comportamento (sem pytest; rode `python tests/test_rules.py`).

Cobre: normalização (anti-merge + conversão de unidade), motor de regras
(multi-finding, escalonamento multi-sistema) e fusão segura (ML-only só c/ painel escasso).
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import normalize, rules_engine, risk_service  # noqa: E402

_passed = 0


def check(name, cond):
    global _passed
    assert cond, f"FALHOU: {name}"
    _passed += 1
    print(f"  ok  {name}")


def test_normalize():
    print("\n[normalize]")
    check("alias EN->canon", normalize.canonicalize_name("Blood Glucose") == "blood_glucose")
    check("alias PT->canon", normalize.canonicalize_name("Hemoglobina Glicada") == "hba1c")
    check("alias abrev", normalize.canonicalize_name("VCM") == "mcv")
    check("anti-merge HbA2 -> None", normalize.canonicalize_name("Hemoglobina A2") is None)
    check("conversao mmol/L->mg/dL",
          abs(normalize.convert_unit(7.0, "mmol/L", "blood_glucose") - 126.13) < 0.1)
    check("conversao g/L->g/dL",
          abs(normalize.convert_unit(140, "g/L", "haemoglobin") - 14.0) < 0.01)
    res = normalize.normalize_marker("A1C", 6.0)
    check("pipeline normalize_marker", res == ("hba1c", 6.0))


def test_rules():
    print("\n[rules_engine]")
    # diabetes: 2 findings (glicose+hba1c) -> high
    r = rules_engine.evaluate({"blood_glucose": 168, "hba1c": 8.1, "systolic_bp": 118,
                               "diastolic_bp": 75, "ldl": 110, "hdl": 52,
                               "triglycerides": 120, "haemoglobin": 14, "mcv": 88})
    check("diabetes primary", r.primary_rule_condition == "diabetes")
    check("diabetes high", r.risk_level == "high")
    check("diabetes 2 findings", len(r.findings) == 2)

    # anemia: Hb + MCV -> moderate
    r = rules_engine.evaluate({"haemoglobin": 9.5, "mcv": 68})
    check("anemia primary", r.primary_rule_condition == "anemia")
    check("anemia 2 findings", len(r.findings) == 2)

    # escalonamento multi-sistema: hipertensão(moderate) + colesterol(moderate) -> high
    r = rules_engine.evaluate({"systolic_bp": 135, "diastolic_bp": 85,
                               "ldl": 170, "hdl": 50, "triglycerides": 100})
    check("multi-sistema -> high", r.risk_level == "high")
    check("multi-sistema 2 cond", len(r.conditions) == 2)

    # fit -> low
    r = rules_engine.evaluate({"blood_glucose": 88, "hba1c": 5.1, "systolic_bp": 112,
                               "diastolic_bp": 70, "ldl": 95, "hdl": 55,
                               "triglycerides": 90, "haemoglobin": 14.8, "mcv": 88})
    check("fit sem findings", len(r.findings) == 0)
    check("fit low", r.risk_level == "low")

    # desempate primária = condição c/ MAIS findings (não a primeira)
    r = rules_engine.evaluate({"ldl": 170, "triglycerides": 220, "hdl": 35})
    check("desempate high_cholesterol (2f) vence cardiovascular_risk (1f)",
          r.primary_rule_condition == "high_cholesterol")


def test_fusion_safety():
    print("\n[fusao segura]")
    # painel CHEIO + limpo: ML disparando NÃO vira alarme de usuário (ml_suspect)
    clean_full = [{"name": n, "value": v, "unit": u} for n, v, u in [
        ("Glicose", 88, "mg/dL"), ("HbA1C", 5.1, "%"), ("Systolic BP", 112, "mmHg"),
        ("Diastolic BP", 70, "mmHg"), ("LDL", 95, "mg/dL"), ("HDL", 55, "mg/dL"),
        ("Triglicerídeos", 90, "mg/dL"), ("Hemoglobina", 14.8, "g/dL"), ("VCM", 88, "fL")]]
    res = risk_service.assess(clean_full)
    check("painel cheio limpo -> none", res["predictedConditionKey"] == "none")
    check("basis rules", res["basis"] == "rules")

    # painel ESCASSO (2 marcadores) + ML confiável: pode usar ml_only
    # (aqui ambos normais -> mesmo assim none; testa só que não explode c/ poucos dados)
    sparse = [{"name": "Glicose", "value": 88, "unit": "mg/dL"},
              {"name": "HDL", "value": 55, "unit": "mg/dL"}]
    res = risk_service.assess(sparse)
    check("painel escasso não explode", res["riskLevel"] in {"low", "moderate", "high"})

    # disclaimer sempre presente
    check("disclaimer presente", "não substitui" in res["medicalDisclaimer"].lower())


if __name__ == "__main__":
    test_normalize()
    test_rules()
    test_fusion_safety()
    print(f"\nTODOS OS {_passed} CHECKS PASSARAM ✅")
