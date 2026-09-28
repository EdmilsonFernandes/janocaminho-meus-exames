import { useEffect, useState } from 'react';
import { Box, Card, CircularProgress, Link, Typography } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import { API_URL } from '../../config';
import { RADIUS } from '../../theme';

/**
 * FEATURE E — "Pesquisas clínicas recrutando" (portal do médico, tab Relatório).
 * Estudos RECRUITING com site no Brasil (ClinicalTrials.gov API v2) casando com as
 * condições crônicas do paciente — derivadas SERVER-side (perfil clínico + remédios
 * de uso contínuo + marcadores crônicos). LGPD: só a palavra-chave da condição sai
 * do servidor; aqui entra só a lista pronta.
 *
 * Estados discretos (caption 12px): loading / erro (retry silencioso) / sem condições
 * mapeadas / sem estudos recrutando. Links externos: target=_blank rel=noopener.
 */
interface TrialStudy { nctId: string; title: string; city?: string; state?: string; url: string }
interface TrialConditionRow { condition: string; conditionPt: string; studies: TrialStudy[]; failed?: boolean }
interface TrialsResponse { conditions: TrialConditionRow[]; degraded?: boolean }

export const ClinicalTrialsCard = ({ patientId, token }: { patientId: string; token: string }) => {
  const [data, setData] = useState<TrialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    fetch(`${API_URL}/doctor/patients/${patientId}/clinical-trials`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d: TrialsResponse) => { if (alive) setData({ conditions: Array.isArray(d?.conditions) ? d.conditions : [], degraded: !!d?.degraded }); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [patientId, token]);

  const rows = data?.conditions ?? [];
  const withStudies = rows.filter((c) => c.studies.length > 0);

  // Sem condições mapeadas (spec server: "sem match → card não renderiza, não inventa"):
  // NADA do card de estudos — só a caption 12px sinalizando o estado. Discreto.
  if (!loading && !error && rows.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Sem condições mapeadas para pesquisa clínica neste paciente.
      </Typography>
    );
  }

  return (
    <Card sx={{ p: 2, borderRadius: RADIUS.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <ScienceIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Pesquisas clínicas recrutando</Typography>
        <Typography variant="caption" color="text.secondary">(ClinicalTrials.gov)</Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">Buscando estudos…</Typography>
        </Box>
      ) : error ? (
        <Typography variant="caption" color="text.secondary">
          Não foi possível buscar ensaios clínicos agora. Atualize o relatório para tentar de novo.
        </Typography>
      ) : withStudies.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          {data?.degraded
            ? 'A busca em ClinicalTrials.gov falhou agora — tente novamente em instantes.'
            : 'Nenhum estudo recrutando no Brasil agora para as condições deste paciente.'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {withStudies.map((c) => (
            <Box key={c.condition}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', display: 'block', textTransform: 'none' }}>
                {c.conditionPt}
              </Typography>
              {c.studies.slice(0, 5).map((s) => (
                <Box key={s.nctId} sx={{ display: 'flex', flexDirection: 'column', py: 0.25 }}>
                  <Link
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    sx={{ fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}
                  >
                    {s.title}
                  </Link>
                  {(s.city || s.state) && (
                    <Typography variant="caption" color="text.secondary">
                      {[s.city, s.state].filter(Boolean).join(' — ')}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          ))}
          {data?.degraded && (
            <Typography variant="caption" color="text.secondary">
              Alguma busca falhou — a lista pode estar incompleta.
            </Typography>
          )}
        </Box>
      )}

      <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
        Fonte: ClinicalTrials.gov — critérios de elegibilidade são do estudo; avalie a indicação.
      </Typography>
    </Card>
  );
};
