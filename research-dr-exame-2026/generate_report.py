#!/usr/bin/env python3
"""Gera report.md a partir de results/*.json + fields.yaml (skill research-report)."""
import json, re, sys
from pathlib import Path

BASE = Path(__file__).parent
RESULTS = BASE / "results"
FIELDS_YAML = BASE / "fields.yaml"
OUT = BASE / "report.md"

# Campos resumidos no TOC (decisão da sessão: user dormindo, não esperar)
TOC_FIELDS = ["category", "country", "pricing_model", "relevance"]

CATEGORY_MAPPING = {
    "basic_info": ["basic_info", "Basic Info", "basics"],
    "product": ["product", "Product"],
    "technology": ["technology", "tech", "Technical Features"],
    "ux": ["ux", "UX"],
    "trust_gaps": ["trust_gaps", "trust", "Gaps", "gaps_opportunities"],
}

def load_fields_structure():
    """Extrai ordem de categorias e nomes de campos do fields.yaml (parser simples)."""
    import yaml
    data = yaml.safe_load(FIELDS_YAML.read_text(encoding="utf-8"))
    groups = data.get("fields", {})
    structure = {}  # cat_key -> [field names]
    for cat, entries in groups.items():
        if isinstance(entries, list):
            structure[cat] = [e.get("name") if isinstance(e, dict) else str(e) for e in entries]
    return structure

def find_field(item_json, field_name):
    """Top level -> qualquer sub-dict (nested por categoria)."""
    if field_name in item_json:
        return item_json[field_name]
    for v in item_json.values():
        if isinstance(v, dict) and field_name in v:
            return v[field_name]
    return None

def is_uncertain(value, field_name, uncertain_set):
    if field_name in uncertain_set:
        return True
    if value is None:
        return True
    if isinstance(value, str):
        s = value.strip()
        if not s or "[uncertain]" in s.lower():
            return True
    if isinstance(value, list) and not value:
        return True
    return False

def fmt_value(value):
    """Formata valores complexos p/ markdown."""
    if isinstance(value, dict):
        parts = [f"{k}: {fmt_value(v)}" for k, v in value.items()]
        return "<br>".join(parts)
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            return "<br>".join(" | ".join(f"{k}: {fmt_value(v)}" for k, v in d.items()) for d in value)
        joined = ", ".join(str(x) for x in value)
        if len(joined) > 120:
            return "<br>".join(f"- {x}" for x in value)
        return joined
    s = str(value)
    if len(s) > 300:
        # quebra longa em bloco
        return s
    return s

def slugify(name):
    s = re.sub(r"[^\w\s-]", "", str(name).strip().lower())
    return re.sub(r"[\s]+", "-", s)

def main():
    structure = load_fields_structure()
    defined_fields = {f for fields in structure.values() for f in fields}
    category_keys = set(structure.keys())

    items = []
    for jf in sorted(RESULTS.glob("*.json")):
        data = json.loads(jf.read_text(encoding="utf-8"))
        uncertain = set(data.get("uncertain", []))
        items.append((jf.stem, data, uncertain))

    lines = []
    lines.append(f"# {len(items)} itens pesquisados — Dr. Exame (saúde digital global, ago/2026)")
    lines.append("")
    lines.append("> Gerado automaticamente de `results/*.json` · campos `[uncertain]`/vazios omitidos")
    lines.append("")

    # ── TOC ──
    lines.append("## Índice")
    lines.append("")
    for i, (stem, data, unc) in enumerate(items, 1):
        name = find_field(data, "name") or stem
        extras = []
        for f in TOC_FIELDS:
            v = find_field(data, f)
            if v and not is_uncertain(v, f, unc):
                sv = fmt_value(v)
                if len(str(sv)) > 60:
                    sv = str(sv)[:57] + "…"
                extras.append(f"{f.replace('_',' ')}: {sv}")
        suffix = (" — " + " · ".join(extras)) if extras else ""
        lines.append(f"{i}. [{name}](#{slugify(name)}){suffix}")
    lines.append("")

    # ── Detalhes ──
    CAT_LABELS = {
        "basic_info": "Básicas", "product": "Produto", "technology": "Tecnologia",
        "ux": "UX", "trust_gaps": "Confiança & Gaps",
    }
    for i, (stem, data, unc) in enumerate(items, 1):
        name = find_field(data, "name") or stem
        lines.append(f"## {name}")
        lines.append("")
        # dados por categoria (na ordem do fields.yaml)
        flat_seen = set()
        for cat, field_names in structure.items():
            emitted = []
            for f in field_names:
                v = find_field(data, f)
                if is_uncertain(v, f, unc):
                    continue
                emitted.append((f, v))
                flat_seen.add(f)
            if emitted:
                lines.append(f"### {CAT_LABELS.get(cat, cat)}")
                lines.append("")
                for f, v in emitted:
                    lines.append(f"- **{f.replace('_',' ')}**: {fmt_value(v)}")
                lines.append("")
        # extras (fora do fields.yaml)
        extras = []
        def walk(d, prefix=""):
            for k, v in d.items():
                if k in ("uncertain", "_source_file") or k in category_keys or k in defined_fields or k in flat_seen:
                    continue
                if isinstance(v, (dict, list)):
                    continue  # só escalares no Other Info
                if not is_uncertain(v, k, unc):
                    extras.append((k, v))
        walk(data)
        if extras:
            lines.append("### Outras infos")
            lines.append("")
            for f, v in extras:
                lines.append(f"- **{f.replace('_',' ')}**: {fmt_value(v)}")
            lines.append("")
        # uncertain array — uma por linha
        if unc:
            lines.append("**Campos incertos** (marcados `[uncertain]` na fase deep):")
            lines.append("")
            for u in sorted(unc):
                lines.append(f"- {u}")
            lines.append("")
        lines.append("---")
        lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {OUT} ({len(items)} itens, {OUT.stat().st_size//1024} KB)")

if __name__ == "__main__":
    main()
