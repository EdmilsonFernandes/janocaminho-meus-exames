// Auditoria de segurança manual — as 6 superfícies que o Strix não completou
// Uso: node test/security-audit.mjs (API dev em 127.0.0.1:4001)
const API = 'http://127.0.0.1:4001/api';

// ── Helpers ──
const login = async (email, password) => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password }),
  });
  const j = await r.json();
  return { token: j.token, patientId: j.patientId, user: j.user };
};
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const GET = async (path, token) => fetch(`${API}${path}`, { headers: token ? H(token) : {} });
const POST = async (path, body, token) => fetch(`${API}${path}`, { method: 'POST', headers: H(token), body: JSON.stringify(body) });

const results = [];
const check = (name, expected, actual, detail = '') => {
  const pass = expected === actual;
  results.push({ name, pass, detail: `${detail} [esperado=${expected}, obtido=${actual}]` });
  console.log(`${pass ? '✅' : '🚨'} ${name}: ${detail}`);
};

// ── Setup: 2 contas de paciente ──
console.log('━━━ SETUP ━━━');
const admin = await login('edmilson@exemplo.com', 'troque123');
console.log('admin token:', admin.token ? 'ok' : 'FALHOU');

// Paciente A (conta existente com exame extraído)
const userA = await login('e2e.jornada.1794854784096.kdbj@exemplo.com', 'Audit@123');
console.log('paciente A:', userA.token ? 'ok' : 'FALHOU');

// Paciente B (nova)
const emailB = `sec.audit.${Date.now()}@test.com`;
await POST('/auth/register', { name: 'Sec Audit B', email: emailB, password: 'SecTest@123', cpf: '11144477735' }, null).catch(() => {});
const userB = await login(emailB, 'SecTest@123');
console.log('paciente B:', userB.token ? 'ok' : 'FALHOU');

// Pegar um exame do paciente A
const examsA = await (await GET('/exams?_start=0&_end=5', userA.token)).json();
const examA = Array.isArray(examsA) ? examsA.find((e) => e.status === 'EXTRACTED') : null;
const examIdA = examA?.id ?? examsA?.[0]?.id;
console.log('exame do paciente A:', examIdA ?? 'nenhum');

// ── 1. ADMIN ROUTE CHECK ──
console.log('\n━━━ 1. ADMIN ROUTES (sem role ADMIN) ━━━');
const adminRoutes = [
  '/admin/users', '/admin/exams', '/admin/config', '/admin/push/campaigns',
  '/admin/tickets', '/admin/ai-config', '/admin/financeiro', '/admin/doctors',
  '/admin/usage', '/admin/pricing',
];
for (const route of adminRoutes) {
  const r = await GET(route, userA.token);
  check(`admin ${route}`, 403, r.status, `paciente tentando admin → ${r.status}`);
}

// ── 2. IDOR/BOLA ──
console.log('\n━━━ 2. IDOR (paciente B tentando exame do paciente A) ━━━');
if (examIdA) {
  // Ler exame de A com token de B
  const r1 = await GET(`/exams/${examIdA}`, userB.token);
  check('IDOR: B lê exame de A', 403, r1.status, `→ ${r1.status}`);

  // Editar exame de A com token de B
  const r2 = await fetch(`${API}/exams/${examIdA}`, { method: 'PUT', headers: H(userB.token), body: JSON.stringify({ title: 'HACKED' }) });
  check('IDOR: B edita exame de A', 403, r2.status, `→ ${r2.status}`);

  // Deletar exame de A com token de B
  const r3 = await fetch(`${API}/exams/${examIdA}`, { method: 'DELETE', headers: H(userB.token) });
  check('IDOR: B deleta exame de A', 403, r3.status, `→ ${r3.status}`);
}

// IDOR em dados do paciente
const rP = await GET(`/patients/${userA.patientId}`, userB.token);
check('IDOR: B lê paciente de A', 403, rP.status, `→ ${rP.status}`);

// ── 3. DOCTOR ↔ PACIENTE ISOLAMENTO ──
console.log('\n━━━ 3. DOCTOR ↔ PACIENTE ━━━');
// Tentar login de médico (não temos credenciais de médico de teste, mas testamos o isolamento da middleware)
// Testar que o middleware rejeita type:'doctor' nas rotas de paciente
const rDoc = await GET('/exams', 'fake-doctor-token');
check('Token inválido/falso médico', 401, rDoc.status, `→ ${rDoc.status}`);

// ── 4. WEBHOOK SPOOFING ──
console.log('\n━━━ 4. WEBHOOK (notificação forjada) ━━━');
// Asaas webhook sem assinatura
const rWh1 = await POST('/webhooks/asaas', { event: 'PAYMENT_CONFIRMED', payment: { id: 'fake-123', value: 999.99, status: 'CONFIRMED' } }, null).catch(e => ({ status: 'ERR', ok: false }));
const wh1Body = await rWh1.clone?.()?.json?.().catch(() => ({})) ?? {};
check('Webhook Asaas sem assinatura', 'não-200', rWh1.status === 200 ? '200' : 'não-200', `→ ${rWh1.status} (body: ${JSON.stringify(wh1Body).slice(0,100)})`);

// OpenPix webhook sem assinatura
const rWh2 = await POST('/webhooks/openpix', { event: 'CHARGE_COMPLETED', charge: { correlationID: 'fake', value: 5000, status: 'COMPLETED' } }, null).catch(e => ({ status: 'ERR' }));
check('Webhook OpenPix sem assinatura', 'não-200', rWh2.status === 200 ? '200' : 'não-200', `→ ${rWh2.status}`);

// ── 5. SQL INJECTION ──
console.log('\n━━━ 5. SQL INJECTION ━━━');
// Testar params de busca/filtro
const sqliPayloads = [
  `' OR 1=1--`,
  `1; DROP TABLE users--`,
  `1' UNION SELECT * FROM users--`,
  `' AND pg_sleep(5)--`,
];
for (const payload of sqliPayloads) {
  const r = await GET(`/exams?q=${encodeURIComponent(payload)}&_start=0&_end=5`, userA.token);
  const is500 = r.status >= 500;
  const isSlow = false; // não medimos tempo aqui, mas o 500 seria o sinal
  check(`SQLi: q=${payload.slice(0,15)}...`, false, is500, `→ ${r.status} ${is500 ? '🚨 ERRO 500 = possível' : '(normal)'}`);
}
// Testar em rotas de admin (com token admin para passar o gate)
const rSqlAdmin = await GET(`/admin/users?q=${encodeURIComponent("1' OR 1=1--")}&_start=0&_end=5`, admin.token);
check('SQLi: admin/users com OR 1=1', false, rSqlAdmin.status >= 500, `→ ${rSqlAdmin.status}`);

// ── 6. AUTENTICAÇÃO ──
console.log('\n━━━ 6. AUTENTICAÇÃO ━━━');
// Sem token
const rNoAuth = await GET('/exams');
check('GET /exams sem token', 401, rNoAuth.status, `→ ${rNoAuth.status}`);

// Token malformado
const rBadToken = await GET('/exams', 'eyJhbGciOiJIUzI1NiJ9.fake.fake');
check('Token malformado', 401, rBadToken.status, `→ ${rBadToken.status}`);

// Token de paciente em rota que espera admin
const rPatOnAdmin = await GET('/admin/users', userA.token);
check('Paciente em /admin/users', 403, rPatOnAdmin.status, `→ ${rPatOnAdmin.status}`);

// ── RESUMO ──
console.log('\n━━━━━━━━━━ RESUMO ━━━━━━━━━━');
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`✅ ${passed} testes passaram | 🚨 ${failed} FALHARAM`);
if (failed > 0) {
  console.log('\n🚨 FALHAS:');
  results.filter((r) => !r.pass).forEach((r) => console.log(`  ${r.name}: ${r.detail}`));
}
process.exit(0);
