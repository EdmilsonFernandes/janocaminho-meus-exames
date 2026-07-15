import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';

export interface JwtPayload {
  userId: string;
  ver?: number; // tokenVersion do user na emissão — requireAuth rejeita se != atual (reset/troca de senha)
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

/** Token de reset de senha (curta duração). `ver` = tokenVersion na emissão → torna o token
 *  single-use (reuso após o reset não casa mais o ver) e invalida sessões antigas no reset. */
export function signResetToken(userId: string, ver: number): string {
  return jwt.sign({ userId, purpose: 'reset', ver }, config.jwtSecret, { expiresIn: '30m' });
}

export function verifyResetToken(token: string): { userId: string; purpose: string; ver?: number } {
  const payload = jwt.verify(token, config.jwtSecret) as { userId: string; purpose: string; ver?: number };
  if (payload.purpose !== 'reset') throw new Error('Token inválido');
  return payload;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const comparePassword = (p: string, hash: string) => bcrypt.compare(p, hash);
