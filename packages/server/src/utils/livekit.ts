/**
 * LiveKit Cloud — salas de teleconsulta DENTRO do app (F2, 19/10/26).
 *
 * LiveKit venceu Jitsi (UI 100% nossa, SDK oficial, free tier ~83 consultas/mês).
 * A sala nasce no agendamento (createLiveKitRoom) e o token de entrada é gerado
 * SOB DEMANDA no join (buildJoinToken) — nunca persistido; re-entrada gera novo
 * (TTL 2h « intervalo mínimo de recorrência → token de uma ocorrência nunca
 * alcança a próxima).
 *
 * Degradação da casa (padrão hasMeetConfig): sem LIVEKIT_URL/API_KEY/API_SECRET
 * no env, `hasLiveKitConfig()` = false → agendamento segue Meet/manual e o join
 * responde 501 (client cai no linkUrl externo como hoje).
 * Docs: docs.livekit.io/home/server/generating-tokens
 */

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

/** Env completo? (mesma cara do hasMeetConfig — desliga graciosa quando falta) */
export function hasLiveKitConfig(): boolean {
  return !!process.env.LIVEKIT_URL && !!process.env.LIVEKIT_API_KEY && !!process.env.LIVEKIT_API_SECRET;
}

/** Cliente admin (criar salas). Instanciado por chamada — só roda com config ok. */
function roomService(): RoomServiceClient {
  return new RoomServiceClient(process.env.LIVEKIT_URL!, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
}

export interface LiveKitJoinInput {
  identity: string;                      // 'patient:<id>' | 'doctor:<id>'
  name: string;                          // display name
  room: string;                          // roomName
  ttlSec?: number;                       // default 7200 (2h)
  metadata?: Record<string, unknown>;    // JSON.stringify interno
}

/**
 * Cria a sala LiveKit da teleconsulta — IDEMPOTENTE: LiveKit devolve a sala
 * existente quando o nome já foi registrado (ocorrência recorrente reusa o
 * mesmo roomName — sala "renascida", decisão D2 do arquiteto).
 * `emptyTimeout` 300s: sala vazia morre sozinha (DELETE/orfandade sem cleanup).
 * `maxParticipants` 2: médico + paciente, ninguém de fora entra nem com link.
 */
export async function createLiveKitRoom(roomName: string): Promise<{ roomName: string }> {
  const room = await roomService().createRoom({
    name: roomName,
    maxParticipants: 2,
    emptyTimeout: 300,
  });
  return { roomName: room.name };
}

/**
 * Token de acesso (JWT) para ENTRAR na sala. Sob demanda no join — cliente
 * nunca cacheia; expirou na hora H → re-join gera token novo (edge case 1).
 * Sem `canPublishData` separado: canPublish+canSubscribe cobrem áudio/vídeo.
 */
export async function buildJoinToken(input: LiveKitJoinInput): Promise<string> {
  const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: input.identity,
    name: input.name,
    ttl: input.ttlSec ?? 7200,
    metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
  });
  token.addGrant({ roomJoin: true, room: input.room, canPublish: true, canSubscribe: true });
  return token.toJwt();
}
