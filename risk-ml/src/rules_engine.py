"""
rules_engine.py — Motor de regras clínicas (MVP explicável).

Camada PRIMÁRIA de risco. Consome clinical_rules.yaml (configurável, não hardcoded),
avalia as bandas de cada marcador e devolve:
  - findings[]: o que disparou (texto PT + severidade + condição + valor)
  - conditions: conjunto de condições suspeitas
  - riskLevel: low / moderate / high  (combina severidade + # sistemas)
  - ruleConfidence: alta se >= N marcadores presentes

100% auditável: cada finding aponta a regra exata (marker + banda) que o gerou.
É a base que o modelo ML (infer.py) apenas CORROBORA — nunca substitui.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
import yaml

_CFG_PATH = Path(__file__).resolve().parent.parent / "config" / "clinical_rules.yaml"
_CACHE: Optional[dict] = None


def _cfg() -> dict:
    global _CACHE
    if _CACHE is None:
        with open(_CFG_PATH, encoding="utf-8") as f:
            _CACHE = yaml.safe_load(f)
    return _CACHE


@dataclass
class Finding:
    marker: str
    name_pt: str
    value: float
    unit: str
    severity: str          # low / moderate / high
    condition: str         # diabetes / anemia / none ...
    finding: str           # texto PT mostrado ao usuário
    band: dict             # regra exata (auditoria)


@dataclass
class RuleResult:
    findings: list[Finding]
    conditions: list[str]           # condições com severidade > info
    risk_level: str                 # low / moderate / high
    rule_confidence: str            # alta / baixa
    primary_rule_condition: Optional[str]   # condição mais severa (desempate: mais findings)
    markers_evaluated: int


def _band_matches(v: float, band: dict) -> bool:
    lo = band.get("min", float("-inf"))
    hi = band.get("max", float("inf"))
    return lo <= v <= hi


def _severity_rank() -> dict:
    return _cfg()["risk_policy"]["severity_rank"]


def evaluate(values: dict[str, float], *, sex: Optional[str] = None) -> RuleResult:
    """Avalia um conjunto {canonical: valor} contra as regras.

    `values` já deve estar normalizado (canonical + unidade padrão) — use normalize.py.
    `sex` ('male'/'female'): hoje não reescreve faixas (TODO V1.1 p/ hemoglobina),
    mas já existe no contrato p/ quando o upstream informar.
    """
    cfg = _cfg()
    markers_cfg = cfg["markers"]
    policy = cfg["risk_policy"]
    rank = policy["severity_rank"]

    findings: list[Finding] = []
    evaluated = 0
    for canon, v in values.items():
        if canon not in markers_cfg:
            continue
        evaluated += 1
        spec = markers_cfg[canon]
        try:
            v = float(v)
        except (TypeError, ValueError):
            continue
        for band in spec["bands"]:
            if _band_matches(v, band) and band.get("severity", "info") != "info" and band.get("finding"):
                findings.append(Finding(
                    marker=canon,
                    name_pt=spec["name_pt"],
                    value=v,
                    unit=spec["unit"],
                    severity=band["severity"],
                    condition=band["condition"],
                    finding=band["finding"],
                    band={k: band.get(k) for k in ("min", "max", "severity", "condition")},
                ))
                break  # 1 finding por marcador (bandas são excludentes)

    # condições ativas
    conditions = sorted({f.condition for f in findings if f.condition != "none"})

    # riskLevel = severidade máxima
    max_rank = max((rank[f.severity] for f in findings), default=0)
    inv_rank = {v: k for k, v in rank.items()}
    risk_level = "low" if max_rank == 0 else inv_rank[max_rank]

    # escalonamento multi-sistema
    esc = policy.get("multi_system_escalation")
    if esc:
        sev_floor = rank[esc["at_severity_gte"]]
        distinct_high = {f.condition for f in findings
                         if f.condition != "none" and rank[f.severity] >= sev_floor}
        if len(distinct_high) >= esc["when_distinct_conditions_gte"]:
            risk_level = esc["becomes"]  # 'high'

    # condição primária (mais severa; desempate = MAIS findings daquela condição)
    primary = None
    if findings:
        def sort_key(f: Finding):
            return (rank[f.severity], sum(1 for g in findings if g.condition == f.condition))
        primary = max(findings, key=sort_key).condition
        if primary == "none":
            primary = None

    n_for_conf = policy.get("min_markers_for_confidence", 5)
    rule_confidence = "alta" if evaluated >= n_for_conf else "baixa"

    return RuleResult(
        findings=findings,
        conditions=conditions,
        risk_level=risk_level,
        rule_confidence=rule_confidence,
        primary_rule_condition=primary,
        markers_evaluated=evaluated,
    )


def doctor_questions(condition: str) -> list[str]:
    """Perguntas sugeridas (campo doctorQuestions) para uma condição."""
    return _cfg().get("doctor_questions", {}).get(condition, [])


def to_dict(r: RuleResult) -> dict:
    d = asdict(r)
    d["findings"] = [asdict(f) for f in r.findings]
    return d


if __name__ == "__main__":  # smoke: caso diabético
    sample = {
        "blood_glucose": 168.0, "hba1c": 8.1,
        "systolic_bp": 118.0, "diastolic_bp": 75.0,
        "ldl": 110.0, "hdl": 52.0, "triglycerides": 120.0,
        "haemoglobin": 14.0, "mcv": 88.0,
    }
    r = evaluate(sample)
    print("riskLevel:", r.risk_level, "| primary:", r.primary_rule_condition,
          "| confidence:", r.rule_confidence, "| markers:", r.markers_evaluated)
    for f in r.findings:
        print(f"  [{f.severity}] {f.condition:18s} {f.finding}")
