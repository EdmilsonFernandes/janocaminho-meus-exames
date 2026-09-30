# SEO Programático + AEO — Dr. Exame (plano set/2026)

> Objetivo: tráfego orgânico composto gerando páginas públicas por analito a partir do
> knowledge base que o server JÁ TEM (exam knowledge + faixas por idade/sexo). Cada página
> termina com CTA → "Cole seu exame" (funil público existente) + link da Play Store.

## Por que funciona
- Milhares de buscas/mês no BR: "tsh alta o que significa", "ferritina baixa", "ldl alto".
- Conteúdo dos concorrentes (UOL/tabelas genéricas) não calcula nada nem tem app.
- O padrão técnico **já existe no projeto**: `publicPages.ts` renderiza HTML standalone
  server-side (`/privacidade` etc.) sem depender do HashRouter — crawler lê direto.

## Arquitetura (sem mexer no HashRouter)
1. Rota pública `GET /exame/:slug` (ex.: `/exame/tsh-alta`) → HTML standalone server-rendered,
   template único + dados do knowledge base (nome, o que é, faixa de referência, alto/baixo,
   perguntas pro médico). Cachea em memória (o conhecimento de analito já é cacheado).
2. `sitemap.xml` dinâmico com todas as páginas + `robots.txt`.
3. **AEO**: resposta direta de 40–60 palavras no topo (o que IAs e featured snippets citam),
   `Schema.org/MedicalWebPage` + `FAQPage`, linguagem leiga, fonte citada.
4. Interlinking: página do analito → exames relacionados → CTA "entenda O SEU caso" (decifre grátis).

## Lote piloto (30 páginas — as mais buscadas BR)
TSH alta · TSH baixa · T4 livre · Hemograma completo · Ferritina baixa · Ferritina alta ·
Vitamina D baixa · Vitamina B12 · Glicemia alta (e jejum) · Hemoglobina glicada (HbA1c) ·
Colesterol LDL alto · HDL baixo · Triglicerídeos altos · Ácido úrico alto · TGO/TGP elevados ·
Creatinina alta · PCR ultrassensível · VHS · Insulina alta (HOMA-IR) · Prolactina alta ·
Testosterona baixa · Estradiol · Progesterona · PSA alto · T3 · Sódio · Potássio ·
Magnésio · Homocisteína · Ácido fólico.

*Depois do piloto: escala p/ todas as ~centenas de analitos do knowledge base (geração automática).*

## Template da página (estrutura)
```
H1: TSH alta: o que significa, causas e o que fazer
RESPOSTA DIRETA (40-60 palavras, alvo de citação por IA/featured snippet)
→ O que é TSH | Faixa de referência (por idade/sexo quando houver)
→ TSH alta: o que pode significar | TSH baixa: idem (bullet leigo)
→ "Isso me diz algo?" → CTA: envie seu exame e veja SEU caso (decifre grátis 3/dia)
→ Perguntas para levar ao médico (3-4 prontas — reutiliza o gerador de perguntas)
→ Disclaimer educação em saúde + CTA Play Store
```

## Passos
1. [ ] Rota `/exame/:slug` + template HTML (server) — 2 dias
2. [ ] Geração dos 30 slotes do knowledge base + revisão clínica rápida — 1 dia
3. [ ] sitemap.xml + robots + Search Console (verificar domínio drexame) — 0,5 dia
4. [ ] Medir (GSC): cliques/impressões por página em 30 dias → decidir escala total
5. [ ] Escala: todos os analitos + páginas de condição ("pré-diabetes exames")

## Métrica de sucesso
30 dias: 1.000+ impressões orgânicas totais; 90 dias: página 1 em ≥10 long-tails; CTA decifre → install.
