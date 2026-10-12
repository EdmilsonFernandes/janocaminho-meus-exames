// 📄 PDF premium do exame (GET /api/exams/:id/report-pdf + rota espelhada do médico):
// - buildExamReportPdf puro: A4, 4 páginas, texto real (magic %PDF + extraível)
// - posse: dono 200; IDOR 404; não-extraído 409; médico com share 200; sem share 403
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, createUser, createExam, createItem, createDoctor, api, authHeader } from './helpers';
import { prisma } from '../src/prisma';
import { buildExamReportPdf } from '../src/utils/examPdf';
import { PDFParse } from 'pdf-parse';

const mockItems = () => [
  { name: 'Hemoglobina', nameCanonical: 'HEMOGLOBINA', panel: 'Hemograma', valueNumeric: 10.1, unit: 'g/dL', refLow: 12, refHigh: 16, flag: 'LOW', isAbnormal: true },
  { name: 'Glicemia', nameCanonical: 'GLICEMIA', panel: 'Bioquímica', valueNumeric: 128, unit: 'mg/dL', refLow: 70, refHigh: 99, flag: 'HIGH', isAbnormal: true },
  { name: 'LDL', nameCanonical: 'LDL', panel: 'Lipídico', valueNumeric: 90, unit: 'mg/dL', refLow: 0, refHigh: 130, flag: 'NORMAL', isAbnormal: false },
];

describe('buildExamReportPdf (pura)', () => {
  it('gera PDF A4 válido de 4 páginas com conteúdo em pt-BR', async () => {
    const buf = await buildExamReportPdf({
      patientName: 'Maria Oliveira Souza',
      examTitle: 'Hemograma Completo',
      performedAt: new Date('2026-09-30T00:00:00Z'),
      sourceLab: 'Fleury',
      score: 78,
      biologicalAge: 41.3,
      items: mockItems(),
    });
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');

    // Estrutura real via pdf-parse (parser independente): 4 páginas + conteúdo esperado.
    const parser = new PDFParse({ data: buf });
    const r = await parser.getText();
    await parser.destroy();
    expect(r.pages.length).toBe(4);
    const all = r.pages.map((p: any) => p.text ?? '').join('\n');
    expect(all).toContain('Relatório de Exame');
    expect(all).toContain('Maria Oliveira Souza');
    expect(all).toContain('Resumo executivo');
    expect(all).toContain('Tabela completa de marcadores');
    expect(all).toContain('Perguntas para levar ao médico');
    expect(all).toContain('documento educativo'); // rodapé
    // rodapé em TODAS as páginas (cada página cita o disclaimer)
    expect(r.pages.filter((p: any) => (p.text ?? '').includes('Gerado por Dr. Exame')).length).toBe(4);
  });
});

describe('GET /api/exams/:id/report-pdf', () => {
  beforeEach(resetDb);

  it('dono recebe application/pdf válido', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueNumeric: 128, valueText: '128', unit: 'mg/dL', refLow: 70, refHigh: 99, flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'LDL', nameCanonical: 'LDL', valueNumeric: 90, valueText: '90', unit: 'mg/dL', refLow: 0, refHigh: 130, flag: 'NORMAL' });

    const r = await api().get(`/api/exams/${exam.id}/report-pdf`).set(authHeader(token)).buffer().parse((res: any, cb: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('404 para exame de outro usuário (IDOR)', async () => {
    const { patient } = await createUser();
    const exam = await createExam(patient.id);
    const other = await createUser();
    const r = await api().get(`/api/exams/${exam.id}/report-pdf`).set(authHeader(other.token));
    expect(r.status).toBe(404);
  });

  it('409 para exame não extraído', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id, { status: 'EXTRACTING' });
    const r = await api().get(`/api/exams/${exam.id}/report-pdf`).set(authHeader(token));
    expect(r.status).toBe(409);
  });
});

describe('GET /api/doctor/patients/:pid/exams/:eid/report-pdf (médico com share)', () => {
  beforeEach(resetDb);

  it('médico com share exams recebe PDF; sem share 403; per-exam respeitado', async () => {
    const { patient, token } = await createUser({ name: 'Paciente Share' });
    const exam = await createExam(patient.id);
    const otherExam = await createExam(patient.id, { title: 'Outro exame' });
    await createItem(exam.id, { name: 'LDL', nameCanonical: 'LDL', valueNumeric: 90, valueText: '90', unit: 'mg/dL', refLow: 0, refHigh: 130, flag: 'NORMAL' });

    const { doctor, token: doctorToken } = await createDoctor({ crm: '97531-SP', email: `pdfdoc-${Date.now()}@exemplo.com` });
    // sem share → 403 (e não vaza existência)
    const noShare = await api().get(`/api/doctor/patients/${patient.id}/exams/${exam.id}/report-pdf`).set(authHeader(doctorToken));
    expect(noShare.status).toBe(403);

    // share com scope exams + somente o exame compartilhado
    await prisma.doctorShare.create({
      data: { doctorId: doctor.id, patientId: patient.id, scopes: ['exams'], examIds: [exam.id], active: true },
    });
    const ok = await api().get(`/api/doctor/patients/${patient.id}/exams/${exam.id}/report-pdf`).set(authHeader(doctorToken)).buffer().parse((res: any, cb: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');
    expect((ok.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // exame FORA da lista de examIds do share → 403
    const blocked = await api().get(`/api/doctor/patients/${patient.id}/exams/${otherExam.id}/report-pdf`).set(authHeader(doctorToken));
    expect(blocked.status).toBe(403);

    // token de paciente NÃO acessa a área do médico
    const asPatient = await api().get(`/api/doctor/patients/${patient.id}/exams/${exam.id}/report-pdf`).set(authHeader(token));
    expect(asPatient.status).toBe(401);
  });
});
