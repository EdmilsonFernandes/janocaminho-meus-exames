import { useCallback, useEffect, useState } from 'react';
import type { PanoramaResponse } from '@meus-exames/shared';
import { API_URL, apiHeaders } from '../config';
import { useSelectedPatient } from '../patient-context';
import type { HealthSummaryLike } from '../utils/panoramaPresenter';

export interface PanoramaData {
  panorama: PanoramaResponse;
  /** O resumo de saúde que alimenta o placar (GET /patients/:id/health-summary). */
  health: HealthSummaryLike | null;
}

export type PanoramaStatus = 'loading' | 'ready' | 'error' | 'no-patient';

const getJson = (url: string) =>
  fetch(url, { headers: apiHeaders() }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/**
 * usePanorama — os dois GETs do "Panorama da sua saúde", em paralelo:
 *   - GET /patients/:id/panorama        → os fatos por área (obrigatório: sem ele não há tela)
 *   - GET /patients/:id/health-summary  → o placar, o MESMO da Home (opcional: se falhar, o herói
 *     mostra "ainda sem placar" e o resto do panorama segue de pé)
 * Refaz sozinho quando o paciente selecionado muda (`useSelectedPatient`) e ignora respostas de
 * um paciente anterior que cheguem tarde. `retry` re-roda os GETs (botão "Tentar de novo").
 */
export function usePanorama() {
  const [pid] = useSelectedPatient();
  const [data, setData] = useState<PanoramaData | null>(null);
  const [status, setStatus] = useState<PanoramaStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pid) {
      setStatus('no-patient');
      setData(null);
      return;
    }
    let dead = false;
    setStatus('loading');
    setData(null);
    Promise.all([
      getJson(`${API_URL}/patients/${pid}/panorama`),
      getJson(`${API_URL}/patients/${pid}/health-summary`).catch(() => null),
    ])
      .then(([panorama, health]) => {
        if (dead) return;
        if (!panorama || typeof panorama !== 'object') throw new Error('panorama vazio');
        setData({ panorama: panorama as PanoramaResponse, health: (health && typeof health === 'object' ? health : null) as HealthSummaryLike | null });
        setStatus('ready');
      })
      .catch(() => {
        if (!dead) setStatus('error');
      });
    return () => {
      dead = true;
    };
  }, [pid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { pid, status, data, retry };
}
