// Upload do ÁUDIO da teleconsulta (F3, 20/10/26) — SEPARADO do upload.ts (PDF/JPG 35MB):
// limites e tipos diferentes, e o destino é o disco EFÊMERO (data/teleconsultas) até o STT
// consumir e DELETAR (D1 LGPD — áudio nunca vai pro banco nem pro S3).
import multer from 'multer';
import fs from 'fs';
import type { Request, Response } from 'express';
import { config } from '../config';

// Garante o diretório em dev (prod: mesmo volume /app/data do container).
fs.mkdirSync(config.teleconsultaDir, { recursive: true });

/** Teto do server (80MB). O STT aceita 25MB (stt.ts STT_MAX_BYTES) — o excedente falha
 *  tipado no transcribeAudio com STT_TOO_LARGE (abort terminal, sem ffmpeg p/ split). */
export const AUDIO_MAX_BYTES = 80 * 1024 * 1024;

export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    // MediaRecorder entrega audio/webm (às vezes com suffix codecs=opus no subtype).
    // reviewer-M: ogg REMOVIDO — o STT rotula o upload como .webm; ogg travestido
    // de webm pode ser rejeitado pelo Groq como erro transiente.
    const ok = /^audio\/webm/i.test(file.mimetype);
    const err = ok ? null : Object.assign(new Error('Envie a gravação em áudio WebM da chamada.'), { status: 400 });
    (cb as any)(err, ok);
  },
});

/** Traduz erro do uploadAudio em resposta HTTP. Devolve TRUE se respondeu (chamador para). */
export function respondAudioUploadError(res: Response, err: any): boolean {
  if (!err) return false;
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Gravação muito grande (limite de 80MB).' });
  } else {
    res.status(err?.status ?? 400).json({ error: err?.message ?? 'Upload de áudio inválido.' });
  }
  return true;
}

/** Executa o multer single('file') programaticamente (a checagem de consent roda ANTES do
 *  parse — sem isso o server decodificaria 80MB de upload recusado). Resolve com o arquivo
 *  ou null quando o wrapper já respondeu 400/413. */
export function acceptAudioFile(req: Request): Promise<Express.Multer.File | null> {
  return new Promise((resolve) => {
    uploadAudio.single('file')(req, req.res as Response, (err: any) => {
      const res = req.res as Response;
      if (respondAudioUploadError(res, err)) { resolve(null); return; }
      resolve((req as Request & { file?: Express.Multer.File }).file ?? null);
    });
  });
}
