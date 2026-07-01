"""
normalize.py — Camada de normalização de exames (Task #7).

Faz duas coisas, sem depender do servidor TS:
  1) CANONICALIZAR nomes: "Hemoglobina Glicada", "A1C", "glicose", "VCM"...
     -> chave canonica (snake) das regras (blood_glucose, hba1c, mcv...).
  2) CONVERTER unidades: mmol/L -> mg/dL, g/L -> g/dL, IFCC -> NGSP, etc.

Casamento: strip de acentos + casefold + busca por substring/borda,
longest-first (pra "hemoglobina glicada" nao cair em "hemoglobina").
Respeita a regra de anti-merge (HbA2/HbF != hemoglobina total) do servidor.

Em producao, o adapter TS->Python pode pular esta etapa e ja enviar a chave
canonica (ts_canonical) — veja marker_aliases.json e response_builder.
"""
from __future__ import annotations
import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "marker_aliases.json"
_CACHE: Optional[dict] = None


def _load_config() -> dict:
    global _CACHE
    if _CACHE is None:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            _CACHE = json.load(f)
    return _CACHE


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _norm(s: str) -> str:
    """Casefold + sem acento + espacos colados. Chave de comparacao."""
    return re.sub(r"\s+", " ", _strip_accents((s or "").casefold())).strip()


# Fração eletroforética de Hb (HbA2, HbF, HbS, HbC) NÃO é hemoglobina total.
# Cuida p/ NÃO engolir "hemoglobina glicada" (palavra inteira) — só bloqueia
# "hemoglobina A2", "hemoglobina F", "hemoglobina S" (uma letra + dígito opcional).
_HB_FRACTION = re.compile(r"^h(em)?oglobina\s+[a-z]\d?(?:\s|$)", re.I)

# Constrói índice longest-first: alias normalizada -> canonical.
_ALIAS_INDEX: Optional[list[tuple[str, str]]] = None


def _alias_index() -> list[tuple[str, str]]:
    global _ALIAS_INDEX
    if _ALIAS_INDEX is None:
        cfg = _load_config()["markers"]
        pairs = []
        for canon, spec in cfg.items():
            pairs.append((_norm(canon), canon))
            for a in spec.get("aliases", []):
                pairs.append((_norm(a), canon))
        # longest-first p/ não casar substring errada
        _ALIAS_INDEX = sorted({(a, c) for a, c in pairs}, key=lambda x: -len(x[0]))
    return _ALIAS_INDEX


def canonicalize_name(raw: str) -> Optional[str]:
    """Nome de exame bruto -> chave canônica, ou None se desconhecido."""
    if not raw:
        return None
    n = _norm(raw)
    if not n:
        return None
    if _HB_FRACTION.match(n):
        return None  # anti-merge: HbA2/HbF não colapsa em hemoglobina
    for alias, canon in _alias_index():
        # borda de não-alfanumérico p/ "ldl" não casar dentro de outra palavra
        if re.search(rf"(^|[^a-z0-9]){re.escape(alias)}([^a-z0-9]|$)", n):
            return canon
    return None


# ---------- conversão de unidades ----------

def _ifcc_to_ngsp(mmol_mol: float) -> float:
    """HbA1c IFCC (mmol/mol) -> NGSP (%). Fórmada DCCT/NGSP."""
    return (0.0915 * mmol_mol) + 2.15


def convert_unit(value: float, unit: Optional[str], canonical: str) -> float:
    """Converte valor para a unidade padrão do marcador canônico."""
    cfg = _load_config()["markers"]
    if canonical not in cfg:
        return value  # desconhecido: devolve inalterado
    spec = cfg[canonical]
    default = spec["unit_default"]
    u = _norm(unit or "").replace(" ", "")
    default_u = _norm(default).replace(" ", "")
    if not u or u == default_u:
        return value
    # HbA1c: IFCC -> %
    if canonical == "hba1c" and u in {"mmol/mol", "mmolmol", "ifcc"}:
        return _ifcc_to_ngsp(value)
    factor = spec.get("unit_alternatives", {}).get(u)
    if factor is None:
        # unidade nao reconhecida: assume padrao (log deveria avisar em producao)
        return value
    return value * factor


def normalize_marker(name: str, value: float, unit: Optional[str] = None) -> Optional[tuple[str, float]]:
    """Pipeline completo: nome -> canônico + valor convertido p/ unidade padrão.

    Retorna (canonical, value_default_unit) ou None se o nome não for reconhecido.
    """
    canon = canonicalize_name(name)
    if canon is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return canon, convert_unit(v, unit, canon)


if __name__ == "__main__":  # smoke test rápido
    cases = [
        ("Hemoglobina Glicada", 7.1, "%"),
        ("A1C", 6.0, None),
        ("Glucose", 7.0, "mmol/L"),
        ("VCM", 72, "fL"),
        ("Triglicerídeos", 220, None),
        ("Hemoglobina A2", 3.5, "%"),     # anti-merge -> None
        ("LDL Colesterol", 3.5, "mmol/L"),
    ]
    for nm, v, u in cases:
        print(f"{nm:24s} {v} {u or '':6s} -> {normalize_marker(nm, v, u)}")
