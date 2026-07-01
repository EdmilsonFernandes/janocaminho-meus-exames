"""
schema.py — Texto seguro (linguagem de risco) + contrato da resposta.

NENHUMA frase aqui afirma diagnóstico. Tudo em "possível", "pode indicar",
"faixa associada a", e SEMPRE recomenda avaliação médica.

userExplanation é MONTADO POR TEMPLATE (determinístico, auditável). Opcionalmente,
o app pode pedir à IA generativa (GLM, via relay já existente) uma redação mais
fluida — mas a IA é EXPLICADORA, com os findings já fixados como fato; ela não
inventa valores nem diagnostica. Veja build_glm_prompt().
"""
from __future__ import annotations

MEDICAL_DISCLAIMER = (
    "Esta análise é apenas educativa e não substitui avaliação médica. "
    "Nenhum resultado aqui constitui diagnóstico."
)

# Por que cada condição → texto curto e não-alarmista ( usa os findings reais ).
_COND_NARRATIVE = {
    "prediabetes": (
        "alguns marcadores glicêmicos estão na faixa de pré-diabetes. "
        "Isso costuma ser reversível com mudanças de hábito, mas merece atenção"
    ),
    "diabetes": (
        "há alterações em glicose e/ou HbA1c que podem indicar risco metabólico aumentado"
    ),
    "hypertension": (
        "a pressão arterial está elevada, o que pode indicar risco de hipertensão"
    ),
    "high_cholesterol": (
        "o perfil lipídico (LDL e/ou triglicerídeos) está alterado, o que pode indicar risco cardiovascular"
    ),
    "cardiovascular_risk": (
        "há sinais (como HDL baixo) que podem indicar risco cardiovascular"
    ),
    "anemia": (
        "hemoglobina e/ou VCM estão alterados, o que pode sugerir anemia — o tipo precisa ser definido por um médico"
    ),
}

_COND_LABEL = {
    "prediabetes": "Possível pré-diabetes",
    "diabetes": "Possível risco de diabetes",
    "hypertension": "Possível risco de hipertensão",
    "high_cholesterol": "Possível risco de colesterol alto",
    "cardiovascular_risk": "Possível risco cardiovascular",
    "anemia": "Possível anemia",
    "none": "Sem alterações relevantes",
}


def condition_label(condition: str | None) -> str:
    return _COND_LABEL.get(condition or "none", "Sem alterações relevantes")


def build_explanation(conditions: list[str], findings: list[dict], risk_level: str) -> str:
    """Monta a explicação em linguagem simples a partir dos findings (determinística)."""
    active = [c for c in conditions if c != "none"]
    if not active:
        return (
            "Nos parâmetros analisados, não foram identificadas alterações relevantes. "
            "Isso não descarta a necessidade de acompanhamento médico de rotina. "
            "Esta análise não substitui uma consulta médica."
        )

    partes = [_COND_NARRATIVE.get(c, "há alterações em alguns marcadores") for c in active]
    lista = "; ".join(partes)
    intensidade = {
        "low": "leve a moderada",
        "moderate": "moderada",
        "high": "importante",
    }.get(risk_level, "moderada")
    quais = ", ".join(f["name_pt"] for f in findings[:4])
    return (
        f"Atenção de intensidade {intensidade}: {lista}. "
        f"Os exames que mais influenciaram esta análise foram: {quais}. "
        "Recomendamos levar estes resultados ao seu médico para confirmação e conduta. "
        "Esta análise não substitui uma consulta médica."
    )


def build_glm_prompt(findings: list[dict], conditions: list[str],
                     risk_level: str, snapshot_context: str = "") -> str:
    """Prompt para a IA generativa (GLM via relay) REESCREVER a explicação de forma fluida.

    A IA recebe os findings JÁ DECIDIDOS como fato e só redige — ela está proibida de
    nomear novas condições, inventar valores ou fechar diagnóstico. (Espelha a filosofia
    do health-summary.ts do servidor: IA explica, dado decide.)
    """
    fatos = "\n".join(f"- {f['name_pt']}: {f['value']} {f['unit']} → {f['finding']}" for f in findings) or "- (sem alterações)"
    return f"""Você é um assistente de REDAÇÃO médica educativa do app Dr. Exame.
Reescreva, em português simples e não-alarmista, a explicação abaixo para o paciente.

REGRAS INQUEBRAVÉIS:
- Use SEMPRE linguagem de "possível", "pode indicar", "faixa associada a".
- É PROIBIDO afirmar diagnóstico ("você tem diabetes", "você está anêmico").
- É PROIBIDO inventar valores ou condições não listadas nos FATOS.
- Recomende avaliação médica. Máx. 4 frases. Tom tranquilo e respeitoso.

CONDIÇÕES SUSPEITAS: {', '.join(conditions) or 'nenhuma'}
NÍVEL DE RISCO: {risk_level}
FATOS (use apenas estes):
{fatos}
{('CONTEXTO DO PACIENTE:\\n' + snapshot_context) if snapshot_context else ''}

Escreva a explicação:"""
