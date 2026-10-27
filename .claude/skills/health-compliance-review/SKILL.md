# Health Compliance Review (Dr. Exame — contexto BR)

> Revisão de conformidade de saúde para mudanças no app. Disparo: "compliance review", revisão pré-deploy de feature com dado de saúde, ou duvidar de um fluxo novo de dado sensível.

Base normativa do produto (resumo operacional — sempre confira o texto vigente):
- **LGPD (Lei 13.709/2018)**: dado de saúde = **dado pessoal sensível (art. 5º, II)**. Exige: base legal (consentimento OU tutela da saúde), **minimização**, finalidade determinada, segurança (art. 46). Direitos do titular: acesso/portabilidade/eliminação (art. 18).
- **ANVISA / RDC 657/2022 + Boas Práticas de Telessaúde**: software de apoio à decisão deve ser **educativo**, sem diagnóstico substituindo profissional. Nosso limite: a IA **nunca diagnostica** — educa, compara com faixas, lista perguntas pro médico (`diagnosticGuard`).
- **CFM (telemedicina)**: leitura de exames é ato médico — o app organiza e educa; quem interpreta é o médico.
- **WCAG 2.1 AA** (acessibilidade — ver skill accessibility-reviewer) e **NIST/IEC 62366** (usabilidade com foco em segurança do paciente — ver health-human-factors).

## Checklist por mudança (marque cada item, cite evidência `arquivo:linha`)

1. **Novo dado coletado?**
   - [ ] É o MÍNIMO necessário? (não coletar "porque um dia serve")
   - [ ] Sensível → criptografia em repouso (padrão: PII via `pgcrypto` como CPF) e em trânsito (HTTPS)
   - [ ] Finalidade documentada e consentimento quando exigido (opt-in explícito, não "aceitou termos")
   - [ ] Entrou no fluxo de **exportação/eliminação** da Privacidade? (usuário precisa conseguir ver e apagar)
2. **Dado exibido?**
   - [ ] Somente pro titular (ou médico **compartilhado pelo paciente** — escopo respeitado nas rotas doctor)
   - [ ] Não vaza em log/erro/telemetria (grep por `console.log` com PII; erro 500 não despeja payload)
3. **IA gerando conteúdo de saúde?**
   - [ ] Prompt com limite educativo + pós-filtro `diagnosticGuard`
   - [ ] Disclaimer "não substitui o médico" visível no produto
   - [ ] Fonte citável quando afirma faixa/alvo (diretriz SBC/SBD/ADA/similar)
4. **Push/e-mail automático com inferência de saúde?**
   - [ ] Sem alarmismo (nada de "seu resultado indica X grave" sem médico)
   - [ ] Opt-out funcional (nudgeEmails/push respeitados)
5. **Crianças/dependentes?**
   - [ ] Dados de menor acessados só pelo titular da conta; compartilhamento com médico exige ação explícita do titular

## Saída
Relatório: item → status (✅/⚠️/❌) → evidência → correção sugerida (PR pequeno quando possível). Bloqueante = ❌ em 1.x/2.ii/3.ii.
