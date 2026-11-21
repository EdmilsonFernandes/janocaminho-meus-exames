// Cartão de emergência PÚBLICO (estudo Guava gap #3) — o que o socorrista vê ao
// escanear o QR do cartão impresso. SEM login, layout próprio minimalista (não é
// o shell do app), dados MÍNIMOS via /api/public/emergency/:token.
// Padrão ReUI (Frame/FramePanel/ReuiBadge) mantém a identidade; fundo vermelho
// suave no topo sinaliza emergência à distância.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Skeleton, Typography } from '@mui/material';
import { API_URL } from '../config';
import {
  Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import { SirenEmergencyIcon } from '@/components/reui/icons';
import { useReuiThemeSync } from '@/components/reui/use-reui-theme';

interface EmergencyData {
  name: string;
  age: number | null;
  gender: string | null;
  allergies: string | null;
  conditions: string | null;
  medications: { name: string; dosage: string | null }[];
  generatedAt: string;
}

const genderLabel = (g: string | null) =>
  g === 'male' ? 'Masculino' : g === 'female' ? 'Feminino' : null;

export const EmergencyPublicPage = () => {
  useReuiThemeSync();
  const { token: tok } = useParams<{ token: string }>();
  const [data, setData] = useState<EmergencyData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tok) { setError(true); return; }
    fetch(`${API_URL}/public/emergency/${encodeURIComponent(tok)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('404'))))
      .then(setData)
      .catch(() => setError(true));
  }, [tok]);

  return (
    <div className="min-h-dvh bg-background" style={{ padding: '16px', maxWidth: 560, margin: '0 auto' }}>
      {/* Cabeçalho de emergência — vermelho, legível à distância */}
      <div
        className="mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3.5"
        role="banner"
      >
        <SirenEmergencyIcon className="size-7 shrink-0 text-red-600 dark:text-red-400" />
        <div>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Ficha Médica de Emergência
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Acesso rápido para atendimento — Dr. Exame
          </Typography>
        </div>
      </div>

      {error ? (
        <Frame>
          <FramePanel className="p-5 text-center">
            <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
              Cartão não encontrado
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Este QR pode ter sido desativado pelo titular. Em emergência, ligue
              <strong> SAMU 192</strong>.
            </Typography>
          </FramePanel>
        </Frame>
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton height={72} />
          <Skeleton height={120} />
          <Skeleton height={96} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* IDENTIFICAÇÃO */}
          <Frame>
            <FramePanel className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{data.name}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {[data.age != null ? `${data.age} anos` : null, genderLabel(data.gender)].filter(Boolean).join(' · ')}
                  </Typography>
                </div>
                <ReuiBadge variant="destructive-light" size="sm">EMERGÊNCIA</ReuiBadge>
              </div>
            </FramePanel>
          </Frame>

          {/* ALERGIAS — o dado que muda conduta primeiro */}
          <Frame>
            <FrameHeader>
              <FrameTitle>Alergias</FrameTitle>
              <FrameDescription>Conferir antes de administrar qualquer medicamento.</FrameDescription>
            </FrameHeader>
            <FramePanel className="p-4">
              <Typography variant="body1" sx={{ fontWeight: data.allergies ? 600 : 400, color: data.allergies ? 'error.main' : 'text.secondary' }}>
                {data.allergies ?? 'Nenhuma alergia registrada.'}
              </Typography>
            </FramePanel>
          </Frame>

          {/* CONDIÇÕES */}
          {data.conditions && (
            <Frame>
              <FrameHeader>
                <FrameTitle>Condições e histórico</FrameTitle>
              </FrameHeader>
              <FramePanel className="p-4">
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{data.conditions}</Typography>
              </FramePanel>
            </Frame>
          )}

          {/* MEDICAMENTOS ATIVOS */}
          <Frame>
            <FrameHeader>
              <FrameTitle>Medicamentos em uso</FrameTitle>
              <FrameDescription>Última atualização pelo titular do perfil.</FrameDescription>
            </FrameHeader>
            <FramePanel className="p-4">
              {data.medications.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nenhum medicamento ativo registrado.</Typography>
              ) : (
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {data.medications.map((m, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.name}</Typography>
                      {m.dosage && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{m.dosage}</Typography>}
                    </li>
                  ))}
                </ul>
              )}
            </FramePanel>
          </Frame>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mt: 1 }}>
            Informações fornecidas pelo próprio paciente · Dr. Exame
          </Typography>
        </div>
      )}
    </div>
  );
};
