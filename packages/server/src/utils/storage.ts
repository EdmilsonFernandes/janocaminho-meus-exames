import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config, useS3 } from '../config';

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: config.s3Region });
  return _s3;
}

/** Infere o media type pela extensão do ref/nome (pdf/jpg/png). */
export function mediaTypeFromRef(ref: string): string {
  const ext = ref.toLowerCase().split('?')[0].split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/pdf';
}

/** Slug simples do nome do paciente pra usar como pasta (ex.: "edmilson-lopes-a1b2"). */
export function patientSlug(fullName: string, patientId: string): string {
  const base = (fullName || 'paciente')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'paciente';
  return `${base}-${patientId.slice(-4)}`;
}

/** Caminho/chave inteligente: <prefixo>/<paciente>/<ano-mês>/<timestamp>-<arquivo>. */
function buildKey(slug: string, filename: string): string {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const safe = (filename || 'exame.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  return `${config.s3Prefix}${slug}/${month}/${Date.now()}-${safe}`;
}

/**
 * Salva o arquivo (PDF/imagem) — no S3 (produção) ou no disco (dev).
 * Devolve um "ref": chave S3 (modo S3) ou caminho local (modo disco).
 */
export async function saveExamFile(buffer: Buffer, slug: string, filename: string, contentType: string): Promise<string> {
  // Extensão CONFIÁVEL pelo content-type (multer detecta o MIME direito). O nome do arquivo
  // pode chegar SEM extensão no WebView móvel — e o mediaTypeFromRef decide imagem vs PDF
  // pela extensão do ref. Antes defaultava p/ .pdf → imagem ia pro pdftotext e falhava.
  const ext = /png/i.test(contentType) ? '.png' : /jpe?g/i.test(contentType) ? '.jpg' : '.pdf';
  if (useS3()) {
    const safeBase = (filename || 'exame').replace(/\.[a-zA-Z0-9]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-50);
    const key = buildKey(slug, `${safeBase}${ext}`);
    await s3().send(new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }));
    return key;
  }
  // disco local (dev)
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const local = path.join(config.uploadDir, `${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(local, buffer);
  return local;
}

/** Lê o arquivo como Buffer (do S3 ou do disco) — usado pela extração por visão. */
export async function readExamFile(ref: string): Promise<Buffer> {
  if (useS3()) {
    const resp = await s3().send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: ref }));
    return Buffer.from(await (resp.Body as any).transformToByteArray());
  }
  return fs.readFileSync(ref);
}

/**
 * Resolve o arquivo p/ download: URL pré-assinada (S3, 15 min) ou caminho local.
 */
export async function resolveExamFile(ref: string): Promise<{ kind: 'url' | 'file'; url?: string; file?: string }> {
  if (useS3()) {
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: config.s3Bucket, Key: ref }),
      { expiresIn: 900 },
    );
    return { kind: 'url', url };
  }
  return { kind: 'file', file: ref };
}

/** Remove o arquivo (no delete do exame). */
export async function deleteExamFile(ref: string): Promise<void> {
  if (useS3()) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await s3().send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: ref })).catch(() => {});
    return;
  }
  if (ref) fs.promises.unlink(ref).catch(() => {});
}

// ===== FOTOS de paciente (mesma abstração S3/disco dos exames) =====
import { optimizeAvatar } from './imageStorage';

/** Salva a foto do paciente — comprime com sharp (512×512 JPEG q80, ~50KB) antes de gravar.
 *  S3 (produção) ou disco (dev). Sempre .jpg (saida do sharp). Cache immutable (avatar busta com ?v=). */
export async function savePatientPhoto(patientId: string, slug: string, buffer: Buffer, contentType: string): Promise<string> {
  const { buffer: optimized } = await optimizeAvatar(buffer);
  if (useS3()) {
    const key = `${config.s3Prefix}fotos/${slug}/avatar.jpg`;
    await s3().send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: optimized, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }));
    presignedPhotoMemo.delete(key); // invalida memo → não serve foto velha após trocar de avatar
    return key;
  }
  fs.mkdirSync(config.photosDir, { recursive: true });
  const local = path.join(config.photosDir, `patient-${patientId}.jpg`);
  fs.writeFileSync(local, optimized);
  return local;
}

// Memo de URL pré-assinada por ref (S3). Sem isto, cada hit gera uma URL NOVA (signature/date
// mudam) → o alvo do redirect muda → o navegador baixa a imagem de novo a cada entrada do portal.
// TTL justo abaixo da validade do presigned (900s) → devolve a MESMA url dentro da janela → o cache
// do browser funciona. Invalidado em savePatientPhoto/saveDoctorPhoto p/ não servir foto velha.
const PHOTO_PRESIGN_TTL_MS = 13 * 60 * 1000;
const presignedPhotoMemo = new Map<string, { url: string; exp: number }>();

/** Resolve a foto p/ servir: URL pré-assinada (S3, 15 min, memoizada) ou caminho local (disco). */
export async function resolvePatientPhoto(ref: string): Promise<{ kind: 'url'; url: string } | { kind: 'file'; file: string }> {
  if (useS3()) {
    const now = Date.now();
    const hit = presignedPhotoMemo.get(ref);
    if (hit && hit.exp > now) return { kind: 'url', url: hit.url };
    const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: config.s3Bucket, Key: ref }), { expiresIn: 900 });
    presignedPhotoMemo.set(ref, { url, exp: now + PHOTO_PRESIGN_TTL_MS });
    return { kind: 'url', url };
  }
  return { kind: 'file', file: ref };
}

/** Salva foto do MÉDICO — comprime com sharp (igual savePatientPhoto). S3 (prod) ou disco (dev). */
export async function saveDoctorPhoto(doctorId: string, buffer: Buffer, contentType: string): Promise<string> {
  const { buffer: optimized } = await optimizeAvatar(buffer);
  if (useS3()) {
    const key = `${config.s3Prefix}fotos-doctor/${doctorId}/avatar.jpg`;
    await s3().send(new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: optimized, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' }));
    presignedPhotoMemo.delete(key); // invalida memo → não serve foto velha após trocar de avatar
    return key;
  }
  fs.mkdirSync(config.photosDir, { recursive: true });
  const local = path.join(config.photosDir, `doctor-${doctorId}.jpg`);
  fs.writeFileSync(local, optimized);
  return local;
}
