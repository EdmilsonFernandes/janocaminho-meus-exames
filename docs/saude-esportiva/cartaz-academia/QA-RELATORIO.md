# Cartaz A3 + Display A5 — Dr. Exame × Academias

Material de divulgação gerado com a skill **canvas-design** (Anthropic) — filosofia visual
**"Métrica Vital"** ([design-philosophy.md](design-philosophy.md)). Criado 07/10/2026.

## Entregáveis

| Arquivo | Uso | Especificação |
|---|---|---|
| `dr-exame-cartaz-a3-sangria.pdf` | **Impressão (parede)** | A3 vertical 297×420mm **+ 3mm de sangria** (página 303×426mm), marcas de corte, fontes embutidas, 1 página |
| `dr-exame-cartaz-a3-300dpi.png` | Digital / prova | 3578×5031px @ 300dpi embutido (full-bleed, sem marcas) |
| `dr-exame-display-a5-sangria.pdf` | **Impressão (balcão/recepção)** | A5 vertical 148×210mm **+ 3mm de sangria** (página 154×216mm), marcas de corte, fontes embutidas, 1 página |
| `dr-exame-display-a5-300dpi.png` | Digital / prova | 1819×2550px @ 300dpi embutido (full-bleed, sem marcas) |

## Conteúdo (todas as afirmações vêm de fontes reais)

- **Chamada**: "Você acompanha seus treinos. E seus exames?" (briefing)
- **Apoio**: "Organize seus exames, acompanhe a evolução e conheça o Modo Saúde Esportiva do Dr. Exame." (verbatim do briefing)
- **Bullets** (validados contra landing ao vivo + `MARKETING-PLAY.md` + E1 em produção):
  - Exames interpretados no contexto de quem treina
  - Régua do laboratório e seu histórico no mesmo gráfico
  - Perguntas prontas para levar ao médico
- **CTA**: "Escaneie e conheça o app." + site `drexame.janocaminho.com.br` como alternativa ao QR
- **Disclaimer**: "Não substitui consulta médica." (+ colophon "Conteúdo educativo")
- **Sem depoimentos, sem promessa de performance, sem menção a substância/ciclo** (guardrail Google/Anvisa do MARKETING-PLAY)

## Identidade (extraída do código — nada inventado)

- Logo oficial: `packages/web/public/app-icon.png` (robô + escudo, conforme DESIGN_SYSTEM)
- Cores do `packages/web/src/theme.ts`: teal `#20b2aa`/`#178f89`/`#5fc9c3`, cobre `#d4a574`, fundo dark `#0f1818`
- Tipografia: Big Shoulders + Geist Mono (canvas-fonts da skill) · Poppins (fonte de marca do app)

## QR Code — gerado por código (lib `qrcode`), NÃO por IA de imagem

- Alvo: `https://drexame.janocaminho.com.br/?utm_source=academia&utm_medium=qr_code&utm_campaign=saude_esportiva`
- `#000000` sobre `#FFFFFF`, quiet zone de 4 módulos (ISO) + respiro extra do cartão branco
- Tamanho impresso: 52mm (A3) / 30mm (A5)

## Validação executada (`qa.mjs` — todos os checks PASSARAM)

1. **QR decodifica (jsQR) dentro dos dois PNGs finais** → exatamente a URL com UTMs
2. **Overflow**: todo elemento dentro do trim (medição de bounding box via Playwright)
3. **Contraste WCAG**: 7 pares de cor usados, todos ≥ AA (teal headline 6,88:1; QR 21:1)
4. **MediaBox dos PDFs**: 859,9×1207,9pt (A3+sangria) e 437×613pt (A5+sangria) ✓
5. **Fontes embutidas**: 6 TTFs subset em cada PDF
6. **Glifos PT-BR** (Ê/Ç) renderizando nas canvas-fonts (sem tofu)
7. **Crítica visual adversária** (modelo de visão + revisão própria): aprovado
8. PNGs com **300dpi embutidos** (pHYs) — revalidado pós-embedding

## Como imprimir

- PDF é a fonte da verdade para gráfica: contém sangria 3mm + marcas de corte.
- Papel sugerido A3: couché 250-300g ou laminação; A5: 250g.
- Se a gráfica pedir "tamanho final": o corte é no trim (297×420 / 148×210mm).

## Toolchain (reprodutível)

```bash
node qr.mjs    # gera+valida QR (assets/qr.svg|png)
node build.mjs # renderiza PDFs (sangria+marcas) e PNGs 300dpi via Playwright
node qa.mjs    # bateria completa de validação
```

- `poster.html` — peça única, parâmetros `?size=a3|a5&marks=0|1`
- Arte de fundo determinística (seed fixa) — mesmas peças a cada build
