# ASO — Dr. Exame (Google Play BR) · set/2026

> Gerado pela skill `app-store-optimization`. Pronto pra colar no Play Console:
> **Crescer → Presença na loja → Página principal da loja** (metadata Android indexa em 1–2h, **sem** precisar de AAB novo).

---

## 1. Audit do listing atual

| Campo | Atual | Diagnóstico |
|---|---|---|
| **Título** | `Dr. Exame` (8 chars de 30) | 🔴 **Problema #1**: o fator de ranqueamento mais forte (título) está desperdiçado — zero keywords. |
| **Descrição curta** | "Entenda seus exames de sangue, laudos e conecte-se a especialistas com IA." (75/80) | 🟡 Boa, mas dá pra densificar benefício+keyword. |
| **Descrição longa** | Rica em features | 🟡 Falta keyword no 1º parágrafo e hooks de busca ("o que significa", "interpretar"). |
| Screenshots / reviews | — | 🟡 Melhorar captions (benefício, não feature) e responder TODOS os reviews. |

## 2. Concorrência (Play BR)

| App | O que é | Fraqueza explorável |
|---|---|---|
| [Meus Exames (Medware)](https://play.google.com/store/apps/details?id=com.medware.meusexamesapp&hl=pt) | App de LAB: acessa resultado | NÃO interpreta nada. Não é concorrente da intenção "entender". |
| [Analisador de Sangue IA](https://play.google.com/store/apps/details?id=com.aibloodtestanalyzer.app) | Interpretação com IA | Tradução genérica, sem família/portal médico/tendências/Libras. |
| [Medical Lab Tests](https://play.google.com/store/apps/details?id=com.westsamoaconsult.labtests&hl=pt) / [Valores Lab](https://play.google.com/store/apps/details?id=com.rermedapps.labvalues) | Tabelas de referência | Público estudante; não analisa O exame do usuário. |
| Examinus / CalcLab (web) | Interpretação web | Sem app/família/portal. |
| Nav Dasa, Concent, Unimed… | Resultado de lab | Outra intenção (acessar laudo). |

**Gap**: ninguém forte disputa *"entender MEU exame"* com profundidade BR (família, médico, Libras, LGPD).

## 3. Keywords pt-BR (avaliação qualitativa — volumes são estimativa)

| Keyword | Relevância | Volume est. | Competição | Prioridade |
|---|---|---|---|---|
| entender exames / entenda seus exames | 🟢 perfeita | médio | baixa | **TÍTULO** |
| interpretar exame de sangue | 🟢 perfeita | médio | baixa | desc. curta/longa |
| exame de sangue o que significa | 🟢 perfeita | médio | baixa | desc. longa |
| laudo / laudo médico | 🟢 alta | médio | média | título/descrição |
| hemograma (também: TSH, colesterol, ferritina) | 🟢 alta | alto | baixa em app | desc. longa |
| exames laboratoriais | 🟢 alta | médio | baixa | desc. longa |
| resultado de exame / meus exames | 🟡 baixa p/ nós | alto | ALTA (labs) | **evitar disputar** |
| acompanhamento de exames / histórico | 🟢 alta | médio | baixa | desc. longa |

## 4. ✅ Metadata NOVA (copiar e colar)

### Título (25/30)
```
Dr. Exame: Entenda Exames
```
*Alternativa se quiser 2ª keyword: `Dr. Exame: Exames e Laudos` (27/30).*

### Descrição curta (78/80)
```
Envie o exame (PDF/foto) e entenda tudo com IA. Laudos, tendências e família.
```

### Descrição longa (~2.700/4.000)
```
Você recebeu seus exames de sangue e não entendeu nada? 🩸

O Dr. Exame lê o seu laudo (PDF ou foto) e explica cada valor em português simples, em segundos. Envie hemograma, colesterol, tireoide, vitamina D ou qualquer exame laboratorial — a IA compara com a faixa de referência, mostra o que está alterado, o que isso pode significar e como evoluiu desde o exame anterior.

📄 ENTENDA QUALQUER EXAME
• Envie o PDF ou uma foto do laudo — a leitura é automática
• Explicação item por item: hemograma, glicemia, colesterol, TSH, ferritina, vitaminas e muito mais
• Interpretar exame de sangue ficou simples: o que significa cada valor alterado, em linguagem leiga
• Evolução entre exames com tendências e gráficos

👨‍👩‍👧 TODA A FAMÍLIA EM UM LUGAR
• Organize os exames seus e dos seus dependentes (filhos, pais, cônjuge)
• Histórico completo e acompanhamento de exames por pessoa

🩺 CONECTE-SE AO SEU MÉDICO
• Compartilhe um resumo da sua saúde com o médico de confiança
• O médico acompanha seus resultados pelo portal próprio, com perguntas e respostas

🤖 IA COM CONTEXTO DA SUA SAÚDE
• Chat: pergunte "o que significa minha TSH alta?" e receba uma resposta do seu perfil
• Interações entre medicamentos
• Idade biológica (PhenoAge) e leitura de risco cardiometabólico
• Perguntas prontas para levar à consulta

🔒 PRIVACIDADE DESDE O DESIGN
• Dados protegidos conforme a LGPD — exames armazenados com segurança, fora do banco de dados clínico
• Libras integrado para acessibilidade

O Dr. Exame é um aplicativo de educação em saúde, feito no Brasil. Ele NÃO substitui consulta médica e NÃO fornece diagnóstico: nosso objetivo é ajudar você a entender seus exames e chegar melhor preparado à consulta.

Baixe agora e transforme aquele monte de números em clareza sobre a sua saúde. ✨
```

## 5. Quick wins além da metadata

1. **Screenshots** — captions de BENEFÍCIO: "Entenda em 30 segundos" (não "Tela de exame"), "Toda a família num só app", "Seu médico acompanha com você".
2. **Responder 100% dos reviews** em até 24h (fator de ranking + conversão; preparar 3–4 respostas padrão).
3. **Store Listing Experiment** (Play Console → Pesquisas) testar título A/B depois de 2 semanas estabilizado.
4. Relançar metadata junto com o AAB 456 em análise (as notas de versão também indexam).
