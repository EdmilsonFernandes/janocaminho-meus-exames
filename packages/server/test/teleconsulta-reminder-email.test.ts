// §13 do spec (docs/design/2026-10-24-teleconsulta-gaps-spec.md): lembrete por
// E-MAIL "começa em X min", entryWindowMin (AppSetting 'teleconsulta', default 5)
// antes do dueDate, pro PACIENTE e pro MÉDICO que agendou — backend puro.
// sendEmail = mock global do setup.ts (SMTP nunca sai da rede de teste); relógio
// controlado via dueDate manipulada + `now` explícito no sendDueReminders (sem
// fake timers — o pass é função exportada, não o setInterval do job).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { sendEmail } from '../src/utils/mailer';
import { loadSettings } from '../src/utils/settings';
import { sendDueReminders, shouldSendStartingReminder, startingEmailMark } from '../src/jobs/reminderEmails';
import { createUser, createDoctor, resetDb } from './helpers';

const MIN = 60_000;

// CRM único por chamada (doctor.crm é UNIQUE — seed() pode rodar 2x no mesmo teste)
let crmSeq = 0;
const nextCrm = () => `${99901 + crmSeq++}-SP`;

/** E-mails "começa em X min" capturados pelo mock (antecedências normais têm outro subject). */
const startingMails = () => vi.mocked(sendEmail).mock.calls.filter((c) => c[0].subject.startsWith('Começa em'));

/** Teleconsulta agendada pelo MÉDICO na conta do PACIENTE.
 *  notifyOffsetsMin [0] = "na hora" → não dispara nada enquanto dueDate é FUTURO
 *  (isola o e-mail §13 das antecedências do fluxo normal nos asserts). */
async function seedTele(opts: {
  ownerId: string; patientId: string; doctorId?: string | null;
  dueDate: Date; consultPriceCents?: number | null; paidAt?: Date | null;
  endedAt?: Date | null; done?: boolean;
}) {
  return prisma.reminder.create({
    data: {
      ownerId: opts.ownerId, patientId: opts.patientId, title: 'Teleconsulta',
      dueDate: opts.dueDate, type: 'teleconsulta', consentAt: new Date(),
      notifyOffsetsMin: [0], provider: 'livekit', roomName: 't-rem13',
      createdByDoctorId: opts.doctorId ?? null,
      consultPriceCents: opts.consultPriceCents ?? null,
      paidAt: opts.paidAt ?? null,
      endedAt: opts.endedAt ?? null,
      done: opts.done ?? false,
      teleStatus: 'scheduled',
    } as any,
    select: { id: true },
  });
}

describe('shouldSendStartingReminder — decisão pura (janela, estado, imediato)', () => {
  const T0 = 1_764_000_000_000; // epoch fixo: dueDate/now explícitos, zero flakiness de relógio
  const due = (min: number) => new Date(T0 + min * MIN);

  it('faltando 6min NÃO manda; faltando 5min (exato) manda; faltando 4min manda', () => {
    const cfg = { entryWindowMin: 5 };
    expect(shouldSendStartingReminder({ dueDate: due(6), done: false, endedAt: null }, T0, cfg)).toBe(false);
    expect(shouldSendStartingReminder({ dueDate: due(5), done: false, endedAt: null }, T0, cfg)).toBe(true);
    expect(shouldSendStartingReminder({ dueDate: due(4), done: false, endedAt: null }, T0, cfg)).toBe(true);
  });

  it('encerrada (endedAt) ou concluída (done) NÃO manda — revalidação de estado', () => {
    const cfg = { entryWindowMin: 5 };
    expect(shouldSendStartingReminder({ dueDate: due(4), done: false, endedAt: new Date(T0) }, T0, cfg)).toBe(false);
    expect(shouldSendStartingReminder({ dueDate: due(4), done: true, endedAt: null }, T0, cfg)).toBe(false);
  });

  it('agendada com MENOS que a janela (agora+3min, janela 5) → dispara IMEDIATO (triggerMs já passou)', () => {
    expect(shouldSendStartingReminder({ dueDate: due(3), done: false, endedAt: null }, T0, { entryWindowMin: 5 })).toBe(true);
  });

  it('consulta já iniciada (dueDate ≤ now) não avisa mais (offset 0 cobre)', () => {
    expect(shouldSendStartingReminder({ dueDate: new Date(T0), done: false, endedAt: null }, T0, { entryWindowMin: 5 })).toBe(false);
    expect(shouldSendStartingReminder({ dueDate: due(-2), done: false, endedAt: null }, T0, { entryWindowMin: 5 })).toBe(false);
  });
});

describe('sendDueReminders — e-mail §13 (paciente + médico)', () => {
  beforeEach(async () => {
    await resetDb();
    await loadSettings(); // repõe defaults (resetDb truncou app_settings → entryWindowMin=5)
    vi.mocked(sendEmail).mockClear();
  });

  /** user (paciente/dono) + médico que agendou + teleconsulta a X min do dueDate. */
  async function seed(minToDue: number, opts: { consultPriceCents?: number | null; paidAt?: Date | null; endedAt?: Date | null; done?: boolean; withDoctor?: boolean } = {}) {
    const { user, patient } = await createUser();
    const doc = opts.withDoctor === false ? null : await createDoctor({ crm: nextCrm(), name: 'Dr. Roberto Silva' });
    const r = await seedTele({
      ownerId: user.id, patientId: patient.id, doctorId: doc?.doctor.id ?? null,
      dueDate: new Date(Date.now() + minToDue * MIN),
      consultPriceCents: opts.consultPriceCents ?? null, paidAt: opts.paidAt ?? null,
      endedAt: opts.endedAt ?? null, done: opts.done ?? false,
    });
    const docRow = doc ? await prisma.doctor.findUnique({ where: { id: doc.doctor.id }, select: { email: true } }) : null;
    return { user, patient, doctorEmail: docRow?.email, reminderId: r.id };
  }

  it('faltando 6min NÃO manda; faltando 4min manda pros DOIS (paciente + médico)', async () => {
    const early = await seed(6);
    const inWindow = await seed(4);
    await sendDueReminders(Date.now());

    const mails = startingMails();
    expect(mails.length).toBe(2); // só a consulta dentro da janela
    const tos = mails.map((c) => c[0].to);
    expect(tos).toEqual(expect.arrayContaining([inWindow.user.email, inWindow.doctorEmail!]));
    expect(tos).not.toContain(early.user.email);
    // conteúdo: link da consulta + fuso explícito (sem dados de saúde)
    const htmls = mails.map((c) => c[0].html).join('\n');
    expect(htmls).toContain(`/#/teleconsulta/${inWindow.reminderId}`);
    expect(htmls).toContain('(horário de Brasília)');
    expect(htmls).toContain('Acessar teleconsulta');
  });

  it('dedup: 2ª passada NÃO repete — markers 100005/200005 persistem no sentOffsets', async () => {
    const s = await seed(4);
    await sendDueReminders(Date.now());
    expect(startingMails().length).toBe(2);

    await sendDueReminders(Date.now()); // reprocessamento/restart: mesmo instante
    expect(startingMails().length).toBe(2); // nada novo

    const row = await prisma.reminder.findUnique({ where: { id: s.reminderId }, select: { sentOffsets: true } });
    expect(row!.sentOffsets).toEqual(expect.arrayContaining([
      startingEmailMark(5, 'patient'), // 100005
      startingEmailMark(5, 'doctor'),  // 200005
    ]));
  });

  it('encerrada (endedAt, ainda done=false) NÃO manda — revalidação dentro do pass', async () => {
    await seed(4, { endedAt: new Date() });
    await sendDueReminders(Date.now());
    expect(startingMails().length).toBe(0);
  });

  it('concluída (done=true) fica fora do findMany → NÃO manda', async () => {
    await seed(4, { done: true, endedAt: new Date() });
    await sendDueReminders(Date.now());
    expect(startingMails().length).toBe(0);
  });

  it('falha no envio pro PACIENTE não bloqueia o MÉDICO (try/catch por destinatário)', async () => {
    const s = await seed(4);
    // Falha ALVO: só o envio ao PACIENTE rejeita. (O register do médico dispara
    // e-mails próprios assincronamente — rejeição "once" por ORDEM seria corrida;
    // e mock.results não distingue promise rejeitada de resolvida.)
    const startingDelivered: string[] = [];
    const startingFailed: string[] = [];
    vi.mocked(sendEmail).mockImplementation(async (mail) => {
      if (!mail.subject.startsWith('Começa em')) return { sent: true }; // register/etc: fora do §13
      if (mail.to === s.user.email) { startingFailed.push(mail.to); throw new Error('smtp down'); }
      startingDelivered.push(mail.to);
      return { sent: true };
    });
    try {
      await sendDueReminders(Date.now());
    } finally {
      vi.mocked(sendEmail).mockResolvedValue({ sent: true }); // restaura o padrão do setup
    }

    expect(startingMails().length).toBe(2); // ambos TENTADOS — falha num não aborta o outro
    expect(startingFailed).toEqual([s.user.email]);     // paciente: smtp down
    expect(startingDelivered).toEqual([s.doctorEmail]); // médico entregue mesmo assim
  });

  it('pagamento pendente (priceCents>0 sem paidAt) avisa SEM prometer sala; paga não avisa', async () => {
    const unpaid = await seed(4, { consultPriceCents: 15000 });
    const paid = await seed(4, { consultPriceCents: 15000, paidAt: new Date() });
    await sendDueReminders(Date.now());

    const patientMailOf = (s: { user: { email: string } }) => startingMails().find((c) => c[0].to === s.user.email)![0].html;
    expect(patientMailOf(unpaid)).toContain('Pagamento pendente');
    expect(patientMailOf(unpaid)).toContain('após a confirmação'); // informa o gate, não promete sala pronta
    expect(patientMailOf(paid)).not.toContain('Pagamento pendente');
  });

  it('sem médico (createdByDoctorId null) → só o PACIENTE é avisado, sem crash', async () => {
    const s = await seed(4, { withDoctor: false });
    await sendDueReminders(Date.now());
    const mails = startingMails();
    expect(mails.length).toBe(1);
    expect(mails[0][0].to).toBe(s.user.email);
  });

  it('entryWindowMin vem da AppSetting (60) — fonte única, sem hardcode', async () => {
    await prisma.appSetting.upsert({
      where: { key: 'teleconsulta' },
      update: { value: { entryWindowMin: 60, minJointSeconds: 300 } as any },
      create: { key: 'teleconsulta', value: { entryWindowMin: 60, minJointSeconds: 300 } as any },
    });
    await loadSettings(); // sincroniza cache
    try {
      // faltando 45min: FORA da janela default (5), DENTRO da janela configurada (60)
      await seed(45);
      await sendDueReminders(Date.now());
      expect(startingMails().length).toBe(2);
      expect(startingMails()[0][0].subject).toContain('Começa em 60 min');
    } finally {
      await prisma.appSetting.delete({ where: { key: 'teleconsulta' } }).catch(() => {});
      await loadSettings(); // devolve defaults p/ os próximos testes
    }
  });
});
