// Prévia visual dos e-mails de KYC (dev): gera os HTML no diretório temporário e imprime a URL file://.
// Uso (de packages/server): npx tsx scripts/preview-kyc-emails.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { doctorKycEmail, kycAdminEmail } from '../src/kyc/emails';

const dir = join(tmpdir(), 'kyc-email-preview');
mkdirSync(dir, { recursive: true });
const portalUrl = 'https://drexame.janocaminho.com.br/#/doctor';
for (const kind of ['received', 'approved', 'rejected'] as const) {
  writeFileSync(join(dir, `${kind}.html`), doctorKycEmail({
    name: 'Dra. Maria da Silva Souza', crm: '116739-SP', kind, portalUrl,
    // Motivo de captura (selfie): mostra as 3 dicas "Como resolver".
    reason: kind === 'rejected' ? 'O rosto não bateu com a foto do documento. Tente de novo com boa luz e sem óculos.' : null,
    captureTips: kind === 'rejected',
  }));
}
// Recusa manual pelo dono: motivo livre (várias linhas) no lugar do texto padrão → card neutro "E agora?".
writeFileSync(join(dir, 'rejected-owner.html'), doctorKycEmail({
  name: 'Dr. João Pereira', crm: '98765-RJ', kind: 'rejected', portalUrl,
  reason: 'A foto do documento ficou ilegível e o CRM enviado não confere com o registro no CFM.\nReenvie o documento original, sem reflexo, e confirme o número do CRM.',
}));
writeFileSync(join(dir, 'admin.html'), kycAdminEmail({
  title: 'Dr. Exame — médico pronto para aprovar (tudo verde)',
  lines: ['Médico: Dra. Maria da Silva Souza · CRM 116739-SP', 'Motivo: manual_policy'],
  adminUrl: 'https://janocaminho.com.br/minhasaude/#/admin',
}));
console.log(pathToFileURL(dir).href);
