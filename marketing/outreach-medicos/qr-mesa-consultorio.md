# QR code de mesa de consultório — canal físico→digital (plano set/2026)

> Usa o funil de convite que JÁ EXISTE (gera token rastreável por médico). O médico ganha um
> QR pronto pra imprimir; cada consulta na sala de espera vira porta de entrada do app.

## Produto
- No **portal médico → aba Pacientes → convite**: botão "QR do meu consultório" que gera
  um PDF A5 pronto pra gráfica com:
  - QR apontando pra `https://drexame.janocaminho.com.br/#/convite/<token-do-medico>`
    (deep link já verificado — abre o app direto no Android com App Links)
  - Copy: **"Escaneie e entenda seus exames em 30 segundos"** + robô Dr. Exame + selo
    "grátis para o paciente" + "seus exames organizados e explicados com IA".
- Impressão sugerida: adesivo 10×15 ou placa acrílica A5 de mesa (~R$15–30/un em gráfica local).

## Por que é diferente
- Email médico você já fez (digital, um disparo). O QR é **presença permanente no ponto de
  cuidado** — o paciente olha o exame na mão NA espera, momento de máxima intenção.
- Rastreável: cada médico tem token próprio → medimos downloads por consultório e
  ranqueamos os parceiros mais ativos (conquistas mensais do portal já mostram engajamento).

## Implementação (≈1 dia)
1. [ ] Endpoint `GET /api/doctor/invites/:id/qr.pdf` (ou front: lib `qrcode` + jsPDF no portal
       médico — sem dependência nova server-side, gera no cliente e baixa).
2. [ ] Template A5 (HTML → PDF) com QR + copy + logo.
3. [ ] Texto pro médico: "imprima e deixe na sua mesa de espera" (entra no e-mail v2 de outreach
       como reforço pós-adesão).

## Métrica
Convites aceitos vindos do QR (token) vs. WhatsApp — meta: 2 pacientes/mês por consultório ativo.
