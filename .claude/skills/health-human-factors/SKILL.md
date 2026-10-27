# Health Human Factors (usabilidade com segurança do paciente)

> Disparo: qualquer mudança de tela que afete DECISÃO de saúde do usuário (exames, alertas, medicação, risco, dosagem), "human factors review", ou antes de AAB patient-facing.

Referências operacionais: **IEC 62366-1** (usabilidade de tecnologia médica), **NIST HCIR** (consumo de informação de saúde por leigos), **WCAG 2.1 AA**. Princípio central: **erro de leitura do usuário é risco clínico** — a tela é instrumento médico disfarçado de app.

## Checklist — os 7 riscos clássicos em app de saúde

1. **Ambiguidade de valor/unidade** — todo número de exame com unidade visível e `inputmode` correto no input (decimal pt-BR). Unidade nunca só pela cor.
2. **Confusão de faixa** — alterado vs normal precisa de ≥2 sinais (cor + ícone/texto), nunca só cor (daltismo). "Dentro da faixa" explícito, não subentendido.
3. **Falsa urgência / falsa calma** — copy de alerta calibrada: sem "URGENTE" sem base, sem minimizar flag crítica. Benchmark interno: "vale conversar com seu médico".
4. **Alvo personalizado rotulado** — quando a faixa vem de perfil/medicação (ex.: TSH em levotiroxina), MOSTRAR o motivo no toque — o usuário precisa saber por que o alvo dele é diferente do papel do laboratório.
5. **Dado desatualizado visível** — exame velho nunca parece atual: carimbo "de X meses" / "histórico" (padrão: staleness no chat-context; replicar em tela).
6. **Alvo de toque e densidade** — botões de ação clínica ≥44px; lista de medicação não deixa "suspender" ao lado de "tomar" sem confirmação quando ação for destrutiva.
7. **Carga cognitiva no momento de decisão** — 1 ação primária por tela de resultado; número-herói legível (≥26px); gráfico com take-away textual (não só a curva).

## Método de revisão
1. Descreva a **decisão** que o usuário toma naquela tela (ex.: "continuar tomando? ligar pro médico?").
2. Siga o checklist acima contra a implementação real (DOM/screenshot, não memória).
3. Achados priorizados: **crítico** (indução a erro clínico) → bloqueia AAB; **alto** (fricção que gera abandono de tarefa); **baixo** (polimento).
4. Entregar com evidência (`arquivo:linha` + comportamento esperado vs observado).
