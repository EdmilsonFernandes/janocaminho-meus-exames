"""
risk_service.py — Orquestrador do módulo de risco.

Pipeline:
  raw_markers[] -> normalize.py -> {canonical: valor}
                 -> rules_engine.evaluate  (PRIMÁRIO, explicável)
                 -> infer.predict           (2ª opinião)
                 -> fusão + schema.build_explanation
                 -> resposta JSON estruturada (Task #5)

DECISÃO DE FUSÃO (segura):
  - predictedCondition vem das REGRAS (primárias). Se regras = nenhuma, mas o ML
    (reliable) sugere algo, exibimos como "sugestão do modelo" — nunca como fato.
  - riskLevel vem das regras.
  - detectedFindings = somente os findings das regras (auditáveis). O ML não gera
    findings opacos.
  - confidence reflete a confiança da PRÓPRIA fusão (não o number~1.0 do ML).
"""
from __future__ import annotations
from typing import Optional
from . import normalize, rules_engine, infer, schema


def _fusion_confidence(rule_conf: str, ml: dict, agreement: bool) -> float:
    """Confiança da FUSÃO (0-1): alta quando regras têm dados + ML concorda."""
    base = 0.55 if rule_conf == "alta" else 0.35
    if ml.get("reliable"):
        base += 0.20
    if agreement:
        base += 0.12
    return round(min(base, 0.97), 2)


def assess(raw_markers: list[dict], *,
           sex: Optional[str] = None,
           glm_explain: bool = False,
           snapshot_context: str = "") -> dict:
    """raw_markers: [{name, value, unit?}, ...] (nomes PT/EN/abrev, unidades variadas)."""
    # 1) normalização
    canonical: dict[str, float] = {}
    unmapped: list[dict] = []
    for m in raw_markers:
        res = normalize.normalize_marker(m.get("name", ""), m.get("value"), m.get("unit"))
        if res:
            canonical[res[0]] = res[1]
        else:
            unmapped.append({"name": m.get("name"), "value": m.get("value"), "unit": m.get("unit")})

    # 2) regras (primário)
    rule = rules_engine.evaluate(canonical, sex=sex)

    # 3) ML (2ª opinião) — só roda se houver features conhecidas
    ml = infer.predict(canonical) if any(c in infer._CANON2COL for c in canonical) else None

    # 4) fusão
    rule_cond = rule.primary_rule_condition
    ml_cond = ml["predictedCondition"] if ml else None
    # concordância vale inclusive p/ none/none (ambos dizem "sem alteração")
    agreement = bool((rule_cond or "none") == ml_cond) if ml_cond is not None else False

    ml_suspect = False  # ML disparou mas regras (painel cheio) não — só auditoria, NÃO usuário
    SPARSE = 5
    if rule_cond:                       # regras mandam
        predicted, basis = rule_cond, "rules"
    elif ml and ml.get("reliable") and ml_cond and ml_cond != "none" and rule.markers_evaluated < SPARSE:
        predicted, basis = ml_cond, "ml_only"   # painel escasso: ML é o único sinal
    else:
        predicted, basis = "none", "rules"
        if ml_cond and ml_cond != "none" and rule.markers_evaluated >= SPARSE:
            ml_suspect = True

    conditions = rule.conditions if rule.conditions else ([ml_cond] if basis == "ml_only" else [])

    # 5) findings explicáveis (texto PT) — só das regras
    detected = [f.finding for f in rule.findings]
    findings_full = [{
        "name_pt": f.name_pt, "marker": f.marker, "value": f.value,
        "unit": f.unit, "severity": f.severity, "condition": f.condition,
        "finding": f.finding,
    } for f in rule.findings]

    risk_level = rule.risk_level
    confidence = _fusion_confidence(rule.rule_confidence, ml or {}, agreement)

    # 6) perguntas p/ o médico (merge das condições ativas)
    questions: list[str] = []
    for c in ([predicted] if predicted != "none" else []) + [c for c in conditions if c != predicted]:
        for q in rules_engine.doctor_questions(c):
            if q not in questions:
                questions.append(q)
    if not questions:
        questions = ["Estes resultados estão alinhados com o esperado para meu perfil?"]

    explanation = schema.build_explanation(conditions, findings_full, risk_level)
    response = {
        "predictedCondition": schema.condition_label(predicted),
        "predictedConditionKey": predicted,
        "confidence": confidence,
        "confidenceNote": "Confiança da análise combinada (regras + modelo), não do modelo isolado.",
        "riskLevel": risk_level,
        "basis": basis,                       # rules | ml_only
        "mlAgreesWithRules": agreement,
        "detectedFindings": detected,
        "findings": findings_full,
        "userExplanation": explanation,
        "doctorQuestions": questions[:6],
        "medicalDisclaimer": schema.MEDICAL_DISCLAIMER,
        "meta": {
            "markersEvaluated": rule.markers_evaluated,
            "markersUnmapped": unmapped,
            "ruleConfidence": rule.rule_confidence,
            "mlSuspect": ml_suspect,   # ML disparou c/ painel cheio e regras limpas -> só auditoria
            "ml": ml,
        },
    }
    if glm_explain:
        response["_glmPrompt"] = schema.build_glm_prompt(findings_full, conditions, risk_level, snapshot_context)
    return response
