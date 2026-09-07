---
name: medical-research
description: Protocolo de pesquisa biomédica com evidência citada para o Dr. Exame — pesquisa via BioMCP (PubMed/diretrizes), curadoria em knowledge/*.md com citações datadas e nível de confiança, separando dado × interpretação × evidência. Usar quando o pedido envolver evidência científica, atualizar conhecimento clínico, novo marcador/condição, ou "por que esse valor importa".
---

# Medical Research — Dr. Exame

Camada científica do produto: transforma marcador/condição em **conhecimento curado com
citação**, consumido pelo app (prompt do GLM via `analysis/knowledge.ts` → `knowledge/*.md`).

## Regras invioláveis (alinhadas ao diagnosticGuard / LGPD / ANVISA)

1. **NUNCA diagnosticar.** O texto do produto educa, compara com faixa, contextualiza e
   lista perguntas pro médico. A decisão clínica é do profissional.
2. Separar SEMPRE, em blocos distintos: **dado do paciente** × **interpretação educativa**
   × **evidência científica** (com fonte) × **perguntas para o médico**.
3. Citar **toda** afirmação clínica nova: fonte (diretriz/journal), ano, e — quando couber —
   link/PMID. Sem fonte = opinião = não entra.
4. Prioridade de evidência: **diretrizes de sociedade (SBD/SBC/ADA/ESC…) > revisões
   sistemáticas/meta-análises > estudos primários**. BioRxiv/preprint só com o rótulo
   "sem revisão por pares".
5. Declarar **nível de confiança** (alta/média/baixa) e a **data da consulta** — evidência
   envelhece; o arquivo carimba quando foi checado.
6. População: o produto é BR — preferir faixas e diretrizes aplicáveis ao Brasil e, em
   pediatria, fontes pediátricas (ex.: Harriet Lane). Nunca extrapolar faixa adulta p/ criança.
7. Nada de dado sensível de paciente em ferramenta externa: pesquisa por **marcador/condição**,
   nunca por valores/nome de usuário.

## Ferramenta

**BioMCP** (já instalado): `mcp__biomcp__search` / `mcp__biomcp__get` com
`entity: "article"` (PubMed). Para drogas `entity: "drug"`, trials `entity: "trial"`.
Queries em inglês (PubMed indexa em EN); o texto curado sai em pt-BR.

## Protocolo (por marcador/condição)

1. **Contexto**: ler o que já existe em `packages/server/knowledge/` (formato das seções:
   "O que é (leigo)", "O que os valores significam", "Fatores que influenciam",
   "Sinais de alerta", "Perguntas úteis para o médico", "Fontes").
2. **Pesquisar** (2–4 queries máx): `<termo> guideline`, `<termo> systematic review`,
   `<termo> <população> management`. Filtrar revisões/diretrizes dos últimos ~5 anos
   quando existirem.
3. **Ler os abstracts** (`get` entity article) dos 2–4 mais relevantes — não citar pelo título.
4. **Curar**: escrever/atualizar o `.md` no formato existente, acrescentando no bloco
   **Fontes** entradas no formato:
   `- [ ] Fonte — Autor/Sociedade, Journal/Ano — achado em 1 linha (confiança: alta) — PMID/URL — consultado AAAA-MM-DD`
5. **Atualização**: evidência com >2 anos sem consulta ganha revisão rápida nas próximas
   passagens pelo mesmo tema (a data de consulta no arquivo denuncia).
6. **Runtime NÃO pesquisa**: o produto só lê o curado. Runtime-PubMed (E-utilities no
   server, só no relatório premium) é decisão arquitetural futura — não implementar
   por dentro desta skill.

## Entregáveis típicos

- Novo/refresh de `packages/server/knowledge/<cond>.md` (mapear em
  `analysis/knowledge.ts` → `FILE_BY_CONDITION` quando for condição nova do risk engine).
- Card de marcador (ex.: `knowledge/marcadores/<nameKey>.md`) — referência curada p/
  enriquecer o prompt do `explain.ts` (camada `exam_knowledge`) quando houver integração.
- Resposta estruturada em chat: Resultado → Evidência → Relevância educativa →
  Perguntas pro médico → Fontes com data.

## Exemplo de saída (padrão do produto)

```
Estradiol elevado (homem)
→ Evidência: elevação persistente em homens avalia-se junto a testosterona, SHBG,
  função hepática e medicamentos (diretriz de endocrinologia; revisão 2023) — confiança alta.
→ Relevância educativa: valor isolado ≠ doença; repetir antes de interpretar.
→ Perguntas pro médico: precisa investigar? avaliar SHBG/testosterona? repetir exame?
→ Fontes: PMID 12345678 · Sociedade X 2024 — consultado 2026-09-07
```
