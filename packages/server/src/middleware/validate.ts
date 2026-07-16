import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { isValidCpf } from '../utils/cpf';

/** Middleware de validação Zod — valida req.body contra um schema.
 *  Se inválido → 400 com a mensagem do primeiro erro. */
export function validate(schema: z.ZodObject<any, any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      res.status(400).json({ error: first?.message || 'Dados inválidos.' });
      return;
    }
    req.body = result.data; // substitui pelo validado (tipos coercidos pelo Zod)
    next();
  };
}

// === SCHEMAS DOS ENDPOINTS CRÍTICOS ===
export const schemas = {
  register: z.object({
    name: z.string().min(2, 'Nome muito curto.').max(100),
    cpf: z.string().refine(isValidCpf, 'CPF inválido.'),
    email: z.string().email('E-mail inválido.'),
    password: z.string().min(6, 'Senha mín. 6 caracteres.'),
    referral: z.string().optional(),
    deviceId: z.string().optional(),
    inviteToken: z.string().optional(),
  }),

  login: z.object({
    username: z.string().optional(),
    email: z.string().optional(),
    password: z.string().min(1, 'Senha obrigatória.'),
    inviteToken: z.string().optional(),
  }),

  doctorRegister: z.object({
    name: z.string().min(2, 'Nome obrigatório.'),
    cpf: z.string().refine(isValidCpf, 'CPF inválido.'),
    crm: z.string().min(3, 'CRM obrigatório.'),
    crmUf: z.string().optional(),
    specialty: z.string().optional(),
    email: z.string().email('E-mail inválido.'),
    password: z.string().min(6, 'Senha mín. 6 caracteres.'),
  }),

  doctorShare: z.object({
    doctorCrm: z.string().min(3, 'CRM obrigatório.'),
    doctorUf: z.string().optional(),
    doctorName: z.string().optional(),
    doctorSpecialty: z.string().optional(),
    doctorEmail: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    convenio: z.string().optional(),
    patientId: z.string().optional(),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6, 'Nova senha mín. 6 caracteres.'),
  }),
};
