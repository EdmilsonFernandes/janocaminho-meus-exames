import multer from 'multer';
import { config } from '../config';

// Em dev (disco) garantimos a pasta; em S3, arquivos ficam só em memória antes do upload.
import fs from 'fs';
fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// memoryStorage: o arquivo vai pro S3 (ou disco via storage.ts). Limite 35MB.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 35 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED.has(file.mimetype);
    (cb as any)(ok ? null : new Error('Tipo de arquivo não suportado. Envie PDF, JPG ou PNG.'), ok);
  },
});
