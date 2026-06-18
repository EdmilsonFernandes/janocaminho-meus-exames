// Setup global dos testes: roda antes de cada arquivo de teste.
// 1) seta o ENV apontando pro DB de teste (dotenv em config.ts NÃO sobrescreve vars já setadas)
// 2) registra mocks dos módulos externos (IA, S3, SMTP, extração) — zero chamada externa
// 3) stub de fetch global p/ o Mercado Pago
import { vi } from 'vitest';

// --- ENV (antes de qualquer import que leia env: config.ts, prisma.ts) ---
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://meus_exames:meus_exames_dev@localhost:5433/meus_exames_test?schema=public';
process.env.JWT_SECRET = 'test-secret';
process.env.MP_ACCESS_TOKEN = 'test-token'; // hasMercadoPago() = true → webhook/checkout testáveis
process.env.WEB_ORIGIN = 'http://localhost:5173';
// externais DESLIGADOS (vazios) — mesmo se .env tiver creds reais, dotenv não sobrescreve.
process.env.ANTHROPIC_API_KEY = '';
process.env.S3_BUCKET = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.UPLOAD_DIR = './data/test-exams';
process.env.PHOTOS_DIR = './data/test-photos';
process.env.AGENT_DIR = './data/test-agent';

// --- MOCKS de módulos externos (valem para TODOS os testes) ---

// E-mail: no-op silencioso (register/otp chamam sendEmail).
vi.mock('../src/utils/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

// Storage: esconde IO de disco/S3; mantém patientSlug/mediaTypeFromRef reais (puras).
vi.mock('../src/utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/storage')>();
  return {
    ...actual,
    saveExamFile: vi.fn().mockResolvedValue('test-ref.pdf'),
    savePatientPhoto: vi.fn().mockResolvedValue('test-photo.jpg'),
    resolveExamFile: vi.fn().mockResolvedValue({ kind: 'file', file: 'test.pdf' }),
    resolvePatientPhoto: vi.fn().mockResolvedValue({ kind: 'file', file: 'test.jpg' }),
    deleteExamFile: vi.fn().mockResolvedValue(undefined),
    readExamFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
  };
});

// Extração assíncrona (fire-and-forget no upload) — no-op.
vi.mock('../src/extraction/pipeline', () => ({
  runExtraction: vi.fn().mockResolvedValue(undefined),
}));

// IA de saúde: respostas canned.
vi.mock('../src/analysis/health-summary', () => ({
  generateHealthSummary: vi.fn().mockResolvedValue({
    summary: { overall: 'ok' },
    contentMd: '# Resumo de teste',
    modelUsed: 'glm-4.6',
    usage: { input_tokens: 10, output_tokens: 20 },
  }),
  generateConsolidatedSummary: vi.fn().mockResolvedValue({
    summary: { overall: 'ok' },
    contentMd: '# Relatório consolidado de teste',
    modelUsed: 'glm-4.6',
    usage: { input_tokens: 30, output_tokens: 40 },
  }),
  loadExamContext: vi.fn().mockResolvedValue({
    title: 'Hemograma',
    kind: 'LAB_PANEL',
    items: [],
    patient: { clinicalProfile: '' },
  }),
  renderSummaryMd: vi.fn().mockReturnValue('# md'),
}));

// Chat SSE: encerra a resposta e devolve texto canned.
vi.mock('../src/analysis/chat', () => ({
  streamChat: vi.fn(async ({ res }: any) => {
    if (res.setHeader) res.setHeader('Content-Type', 'text/event-stream');
    if (res.write) res.write('data: {"delta":"resposta de teste"}\n\n');
    if (res.end) res.end();
    return { text: 'Resposta de teste do Dr. Exame.', model: 'glm-4.6' };
  }),
}));

// Memória do agente (ler/gravar .md) — no-op; patientSlug repassado.
vi.mock('../src/analysis/agent-memory', () => ({
  readPatientMemory: vi.fn().mockReturnValue(''),
  memoryDigest: vi.fn().mockReturnValue(''),
  conversationDigest: vi.fn().mockReturnValue(''),
  appendPatientMemory: vi.fn(),
  appendConversation: vi.fn(),
  saveFullReport: vi.fn(),
  patientSlug: (fullName: string, id: string) => `${(fullName || 'paciente').slice(0, 8)}-${(id || '').slice(-4)}`,
}));

// --- fetch global (Mercado Pago): default genérico; billing tests sobrescrevem por chamada. ---
const defaultResponse = {
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => '',
};
globalThis.fetch = vi.fn(async () => defaultResponse as any) as any;
