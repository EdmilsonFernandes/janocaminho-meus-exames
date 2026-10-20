import { useState, useEffect, useCallback } from 'react';
import { API_URL, token } from '../config';
import { useSelectedPatient } from '../patient-context';

export interface TeleconsultaItem {
  id: string;
  patientId: string;
  title: string;
  dueDate: string;
  type: string;
  provider?: string;
  linkUrl?: string;
  consentAt?: string | null;
  doctor?: {
    name?: string;
    crm?: string;
    crmUf?: string;
    specialty?: string;
  };
  done?: boolean;
  createdAt?: string;
}

export type TeleconsultaStatus = 'none' | 'live' | 'today' | 'upcoming' | 'recent';

export interface UpcomingTeleconsultaState {
  item: TeleconsultaItem | null;
  status: TeleconsultaStatus;
  startsInText: string | null;
  relativeLabel: string | null;
  timeLabel: string | null;
  roomCode: string | null;
  doctorName: string | null;
  doctorSpecialty: string | null;
  specialty: string | null;
  isToday: boolean;
  isLive: boolean;
  hasConsent: boolean;
  hasPendingExams: boolean;
  pendingRequestsCount: number;
  reload: () => Promise<void>;
}

export function useUpcomingTeleconsulta(): UpcomingTeleconsultaState {
  const [pid] = useSelectedPatient();
  const [item, setItem] = useState<TeleconsultaItem | null>(null);
  const [status, setStatus] = useState<TeleconsultaStatus>('none');
  const [startsInText, setStartsInText] = useState<string | null>(null);
  const [pendingReqs, setPendingReqs] = useState<number>(0);

  const load = useCallback(async () => {
    if (!pid || !token()) {
      setItem(null);
      setStatus('none');
      setStartsInText(null);
      setPendingReqs(0);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/reminders?patientId=${pid}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const data: any[] = await res.json();
      if (!Array.isArray(data)) return;

      const teleconsultas = data
        .filter((r) => r && (r.type === 'teleconsulta' || r.provider === 'livekit'))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      if (teleconsultas.length === 0) {
        setItem(null);
        setStatus('none');
        setStartsInText(null);
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();

      // Encontra teleconsulta relevante:
      // 1. Ao vivo (começou há menos de 60min ou começa nos próximos 15min)
      // 2. Hoje (no mesmo dia civil)
      // 3. Próxima agendada (futura)
      // 4. Se não houver futura, a mais recente das últimas 48h
      let chosen: TeleconsultaItem | null = null;
      let calculatedStatus: TeleconsultaStatus = 'none';

      for (const tc of teleconsultas) {
        const dueMs = new Date(tc.dueDate).getTime();
        const diffMinutes = (dueMs - nowMs) / (1000 * 60);

        // Ao vivo: entre 15 min antes até 60 min após o horário
        if (diffMinutes >= -60 && diffMinutes <= 15) {
          chosen = tc;
          calculatedStatus = 'live';
          break;
        }

        // Hoje: mesma data local
        const dueDate = new Date(tc.dueDate);
        const isSameDay =
          dueDate.getFullYear() === now.getFullYear() &&
          dueDate.getMonth() === now.getMonth() &&
          dueDate.getDate() === now.getDate();

        if (isSameDay && diffMinutes > 15) {
          chosen = tc;
          calculatedStatus = 'today';
          break;
        }

        // Futura (nos próximos dias)
        if (dueMs > nowMs) {
          if (!chosen || dueMs < new Date(chosen.dueDate).getTime()) {
            chosen = tc;
            calculatedStatus = 'upcoming';
          }
        }
      }

      // Fallback: se não achou futura, checa se tem recente (passou há menos de 48h)
      if (!chosen) {
        const past = teleconsultas
          .filter((t) => new Date(t.dueDate).getTime() < nowMs && (nowMs - new Date(t.dueDate).getTime()) < 48 * 3600 * 1000)
          .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
        if (past[0]) {
          chosen = past[0];
          calculatedStatus = 'recent';
        }
      }

      setItem(chosen);
      setStatus(calculatedStatus);

      if (chosen) {
        const diffMs = new Date(chosen.dueDate).getTime() - nowMs;
        if (calculatedStatus === 'live') {
          setStartsInText('Agora');
        } else if (diffMs > 0) {
          const diffHours = Math.floor(diffMs / (1000 * 3600));
          const diffMins = Math.floor((diffMs % (1000 * 3600)) / (1000 * 60));
          if (diffHours === 0) {
            setStartsInText(`em ${diffMins} min`);
          } else if (diffHours < 24) {
            setStartsInText(`em ${diffHours}h${diffMins > 0 ? `${diffMins}m` : ''}`);
          } else {
            const days = Math.ceil(diffMs / (1000 * 86400));
            setStartsInText(`em ${days} dia${days > 1 ? 's' : ''}`);
          }
        } else {
          setStartsInText('concluída');
        }

        // Checar pedidos de exames pendentes vinculados
        try {
          const reqRes = await fetch(`${API_URL}/exam-requests?patientId=${pid}`, {
            headers: { Authorization: `Bearer ${token()}` },
          });
          if (reqRes.ok) {
            const reqData = await reqRes.json();
            const list: any[] = Array.isArray(reqData?.items) ? reqData.items : Array.isArray(reqData) ? reqData : [];
            const count = list.filter((x) => x?.status === 'pending' && x.reminderId === chosen?.id).length;
            setPendingReqs(count);
          }
        } catch {
          // offline ok
        }
      } else {
        setStartsInText(null);
        setPendingReqs(0);
      }
    } catch {
      // offline / falha silenciosa
    }
  }, [pid]);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 60000); // atualiza a cada 1 min
    window.addEventListener('storage', load);
    window.addEventListener('selPatientChanged', load);
    window.addEventListener('teleconsultaChanged', load);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', load);
      window.removeEventListener('selPatientChanged', load);
      window.removeEventListener('teleconsultaChanged', load);
    };
  }, [load]);

  const timeLabel = item?.dueDate
    ? new Date(item.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const specialty = item?.doctor?.specialty || null;

  return {
    item,
    status,
    startsInText,
    relativeLabel: startsInText,
    timeLabel: timeLabel ? `às ${timeLabel}` : null,
    roomCode: item?.id ? String(item.id).slice(-5).toUpperCase() : null,
    doctorName: item?.doctor?.name || null,
    doctorSpecialty: specialty,
    specialty,
    isToday: status === 'today',
    isLive: status === 'live',
    hasConsent: !!item?.consentAt,
    hasPendingExams: pendingReqs > 0,
    pendingRequestsCount: pendingReqs,
    reload: load,
  };
}
