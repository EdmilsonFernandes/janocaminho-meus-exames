import { useState, type ReactNode } from 'react';
import { Box, Container, Typography, Button, Stack, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SpeedIcon from '@mui/icons-material/Speed';
import ScienceIcon from '@mui/icons-material/Science';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Reveal } from '../Reveal';

const TEAL_DARK = '#178f89';
const INK = '#0f5f5a';
const COPPER = '#b88a54';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

/**
 * Dados demonstrativos interativos — 4 cenários de atletas.
 * Regra dura: TODO número clínico citado vem de packages/server/knowledge
 * (SBEM 2026 / Endocrine Society 2018: hematócrito 48–54% atenção, >54% protocolo;
 * EFLM 2018: CK elevada por até 5–7 dias pós-esforço, sem janela universal;
 * HAARLEM/JCEM 2026: cistatina-C preferida sobre creatinina; SBH 2024: ferritina
 * <30 ng/mL = reservas baixas). Faixas de "meta" são EXEMPLO de meta clínica
 * definida pelo médico — nunca teto de segurança inventado.
 */
const sportsDemoData = {
  ck: {
    markerName: 'Creatina Quinase (CK Total)',
    val: '1.420',
    unit: 'U/L',
    status: 'Consistente com esforço recente',
    statusBg: 'rgba(13,148,136,0.12)',
    statusColor: '#0f766e',
    patientContext: 'Treino de pernas (esforço excêntrico intenso) há 24h',
    labRef: 'Lab: 30 a 200 U/L',
    targetRef: 'Variação esperada pós-treino (contexto)',
    rulerLabLeft: '5%',
    rulerLabWidth: '20%',
    rulerTargetLeft: '25%',
    rulerTargetWidth: '55%',
    rulerPinLeft: '68%',
    explanation: 'Leitura provável: elevação por microrrupturas musculares do treino de ontem — e não lesão hepática (TGP e Gama-GT normais). A literatura (EFLM) mostra CK elevada por até 5–7 dias após esforço intenso. Confirmar com o médico é o próximo passo, não um alarme.',
    tip: 'Hidratação reforçada e intervalo antes do próximo treino pesado da mesma musculatura; valide a hipótese com seu médico.',
  },
  renal: {
    markerName: 'Cistatina-C (Filtração Glomerular)',
    val: '0,78',
    unit: 'mg/L',
    status: 'Função renal preservada',
    statusBg: 'rgba(16,185,129,0.12)',
    statusColor: '#047857',
    patientContext: 'Musculação com alta massa muscular + creatina 5g/dia',
    labRef: 'Lab Ref: 0,55 a 1,02 mg/L',
    targetRef: 'Meta do seu médico (exemplo)',
    rulerLabLeft: '15%',
    rulerLabWidth: '50%',
    rulerTargetLeft: '20%',
    rulerTargetWidth: '40%',
    rulerPinLeft: '45%',
    explanation: 'A creatinina do laudo veio 1,35 mg/dL — falso positivo clássico de massa muscular e suplementação de creatina. A cistatina-C não depende do músculo e, aqui, mostra função renal preservada (grupo HAARLEM, JCEM 2026 recomenda o marcador nesse perfil).',
    tip: 'Informe creatina e massa magra ao médico antes de aceitar leituras de creatinina isolada.',
  },
  trt: {
    markerName: 'Hematócrito (Concentração de Hemácias)',
    val: '51,8',
    unit: '%',
    status: 'Zona de atenção: 48% a 54%',
    statusBg: 'rgba(245,158,11,0.12)',
    statusColor: '#b45309',
    patientContext: 'Homem de 34 anos em reposição hormonal de testosterona (TRT)',
    labRef: 'Lab: 40% a 50%',
    targetRef: 'Zona de atenção clínica: 48% a 54%',
    rulerLabLeft: '15%',
    rulerLabWidth: '45%',
    rulerTargetLeft: '35%',
    rulerTargetWidth: '30%',
    rulerPinLeft: '78%',
    explanation: '51,8% está dentro da zona de atenção (48–54%) em que desidratação, altitude e treino intenso também elevam o valor. Acima de 54%, as diretrizes SBEM 2026 e Endocrine Society indicam protocolo médico — a decisão é do médico que prescreveu. Não espere o 54% para organizar a conversa.',
    tip: 'Hidratação diária reforçada, monitorar pressão arterial e levar o histórico ao seu endocrinologista.',
  },
  ferro: {
    markerName: 'Ferritina Sérica',
    val: '24',
    unit: 'ng/mL',
    status: 'Reservas de ferro baixas',
    statusBg: 'rgba(239,68,68,0.12)',
    statusColor: '#b91c1c',
    patientContext: 'Corredora de rua / maratonista com fadiga nos treinos longos',
    labRef: 'Lab: 10 a 120 ng/mL',
    targetRef: 'Meta do seu médico (exemplo)',
    rulerLabLeft: '10%',
    rulerLabWidth: '70%',
    rulerTargetLeft: '45%',
    rulerTargetWidth: '45%',
    rulerPinLeft: '22%',
    explanation: 'O laboratório marca "normal" acima de 10 ng/mL, mas a referência da SBH 2024 considera reservas baixas abaixo de 30 ng/mL — e fadiga em treinos longos é a queixa clássica desse quadro. Investigar e repor é conduta médica.',
    tip: 'Converse sobre reposição de ferro e coadjuvantes com seu médico ou nutricionista esportiva.',
  },
};

type SportTab = keyof typeof sportsDemoData;

/** Pilares de diferenciação — versão curta (compact) e longa (full). */
type Pillar = { icon: ReactNode; title: string; desc: string; badge?: string };
const pillarsShort: Pillar[] = [
  { icon: <SpeedIcon sx={{ color: '#0d9488', fontSize: 26 }} />, title: 'CK e TGO pós-treino', desc: 'CK alta depois do treino pesado pode ser o músculo falando — não o fígado. Contexto EFLM, sem alarme falso.' },
  { icon: <ScienceIcon sx={{ color: '#6366f1', fontSize: 26 }} />, title: 'Creatinina × Cistatina-C', desc: 'Músculo e creatina elevam a creatinina sem problema renal. A literatura indica a cistatina-C nesse perfil.' },
  { icon: <HealthAndSafetyIcon sx={{ color: '#f59e0b', fontSize: 26 }} />, title: 'Hematócrito em reposição', desc: '48–54% é zona de atenção; acima de 54%, diretrizes pedem conversa médica (SBEM/Endocrine Society).' },
  { icon: <VerifiedUserIcon sx={{ color: '#10b981', fontSize: 26 }} />, title: 'Sigilo absoluto', desc: 'Declare suplementos e reposição sem julgamento — confidencial (LGPD). O app nunca recomenda dose ou ciclo.' },
];

const pillarsFull: Pillar[] = [
  { icon: <SpeedIcon sx={{ color: '#0d9488', fontSize: 26 }} />, title: 'CK e TGO pós-treino', badge: 'Contexto muscular', desc: 'Treinou perna pesado ontem? A CK pode vir altíssima e o TGO subir junto — sem significar lesão hepática. A IA correlaciona esforço e enzimas com base na recomendação da EFLM (coleta sem exercício intenso nas 24h anteriores) e prepara as perguntas certas pra consulta.' },
  { icon: <ScienceIcon sx={{ color: '#6366f1', fontSize: 26 }} />, title: 'Creatinina × Cistatina-C', badge: 'Zero falso positivo', desc: 'Alta massa muscular e suplementação com creatina elevam a creatinina do laudo sem piora renal. O grupo HAARLEM (JCEM 2026) recomenda a cistatina-C para medir a filtração real nesse perfil — e a IA do Dr. Exame sabe disso.' },
  { icon: <HealthAndSafetyIcon sx={{ color: '#f59e0b', fontSize: 26 }} />, title: 'Hematócrito em reposição', badge: 'Segurança com fonte', desc: 'Quem faz reposição de testosterona monitora o hematócrito: entre 48% e 54% é zona de atenção contextualizada; acima de 54%, as diretrizes SBEM 2026 e Endocrine Society indicam protocolo médico. Nós apontamos a tendência — a conduta é do seu médico.' },
  { icon: <VerifiedUserIcon sx={{ color: '#10b981', fontSize: 26 }} />, title: 'Sigilo absoluto', badge: '100% confidencial', desc: 'Declare suplementos, pré-treinos e reposição hormonal prescrita sem tabu: registro confidencial, criptografado, conforme LGPD. O app NUNCA recomenda dose, ciclo ou substância — educa, contextualiza e monta o roteiro de perguntas para o seu médico.' },
];

/**
 * Seção Saúde Esportiva da landing.
 * - variant="compact": home padrão (dual-audience) — não domina, linka a variante ?sports=1.
 * - variant="full": variante ?sports=1 (tráfego QR de academia) — pilares completos.
 */
export const SportsSection = ({ variant = 'compact', onGoDemo }: { variant?: 'compact' | 'full'; onGoDemo?: () => void }) => {
  const navigate = useNavigate();
  const [activeSportTab, setActiveSportTab] = useState<SportTab>('ck');
  const full = variant === 'full';
  const data = sportsDemoData[activeSportTab];
  const pillars = full ? pillarsFull : pillarsShort;

  return (
    <Reveal>
      <Box id="esporte" sx={{
        bgcolor: '#f8fafc',
        py: { xs: full ? 6 : 5, md: full ? 10 : 8 },
        borderTop: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'rgba(15,95,90,0.08)',
        position: 'relative',
        overflow: 'hidden',
        scrollMarginTop: 80,
      }}>
        <Box sx={{ position: 'absolute', top: '-120px', right: '-100px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(32,178,170,0.12) 0%, rgba(248,250,252,0) 70%)', pointerEvents: 'none', zIndex: 0 }} />
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 5 } }}>
            <Chip
              icon={<FitnessCenterIcon sx={{ fontSize: 17 }} />}
              label="Saúde Esportiva"
              sx={{ bgcolor: 'rgba(13,148,136,0.12)', color: TEAL_DARK, fontWeight: 700, mb: 2, fontSize: 13, pl: 1, '& .MuiChip-icon': { color: TEAL_DARK } }}
            />
            <Typography variant="h2" sx={{ fontSize: { xs: full ? '1.9rem' : '1.7rem', md: full ? '2.8rem' : '2.2rem' }, fontWeight: 800, color: 'text.primary', mb: 2, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Exames na realidade de quem treina, <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>sem alarmismo.</Box>
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: { xs: 16, md: 18 }, maxWidth: 740, mx: 'auto', lineHeight: 1.65 }}>
              {full
                ? 'Musculação, corrida ou reposição hormonal com acompanhamento médico: o laboratório compara você com a média sedentária. O Dr. Exame interpreta cada marcador com fisiologia esportiva — e a fonte sempre à vista.'
                : 'O laboratório compara você com a média sedentária. CK, creatinina e hematócrito têm outra leitura pra quem treina — com diretrizes médicas citadas.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.05fr 1.15fr' }, gap: { xs: 4, lg: 5 }, alignItems: 'start', mb: full ? 6 : 4 }}>
            {/* Pilares */}
            <Stack spacing={2.5}>
              {pillars.map((item, idx) => (
                <Box key={idx} sx={{
                  p: 2.5,
                  bgcolor: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid rgba(15,95,90,0.1)',
                  boxShadow: '0 4px 16px rgba(15,95,90,0.03)',
                  transition: 'all 0.2s ease',
                  '&:hover': { borderColor: 'rgba(32,178,170,0.4)', boxShadow: '0 8px 24px rgba(15,95,90,0.08)', transform: 'translateY(-2px)' },
                }}>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: 'rgba(13,148,136,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary' }}>{item.title}</Typography>
                        {item.badge ? <Chip label={item.badge} size="small" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,95,90,0.07)', color: INK }} /> : null}
                      </Stack>
                      <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.55 }}>{item.desc}</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Stack>

            {/* Showcase interativo — réplica do dashboard esportivo */}
            <Box sx={{ bgcolor: '#ffffff', borderRadius: '24px', border: '1px solid rgba(15,95,90,0.15)', boxShadow: '0 12px 36px rgba(15,95,90,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: { xs: 2.5, sm: 3 }, bgcolor: 'rgba(240,250,249,0.7)', borderBottom: '1px solid rgba(15,95,90,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 38, height: 38, borderRadius: '10px', bgcolor: TEAL_DARK, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>RS</Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>Rodrigo Silva, 31 anos</Typography>
                      <Chip label="Atleta Ativo" size="small" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.15)', color: TEAL_DARK }} />
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Contexto: Musculação Intensa + Suplementação</Typography>
                  </Box>
                </Stack>
                <Chip icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} label="Modo Esporte Ativo" sx={{ height: 26, fontSize: 11.5, fontWeight: 700, bgcolor: '#ffffff', color: TEAL_DARK, border: '1px solid rgba(13,148,136,0.25)' }} />
              </Box>

              {/* Cenários */}
              <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, bgcolor: '#fbfcfd', borderBottom: '1px solid rgba(15,95,90,0.08)' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', mb: 1.25, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Toque num cenário pra testar:
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
                  {([
                    { id: 'ck', num: '1', name: 'CK pós-treino', sub: 'Músculo vs. Fígado' },
                    { id: 'renal', num: '2', name: 'Cistatina-C', sub: 'Função Renal Real' },
                    { id: 'trt', num: '3', name: 'Hematócrito', sub: 'Reposição Hormonal' },
                    { id: 'ferro', num: '4', name: 'Ferritina', sub: 'Reservas / Corrida' },
                  ] as { id: SportTab; num: string; name: string; sub: string }[]).map((tab) => {
                    const active = activeSportTab === tab.id;
                    return (
                      <Box
                        key={tab.id}
                        component="button"
                        type="button"
                        onClick={() => setActiveSportTab(tab.id)}
                        sx={{
                          textAlign: 'left',
                          p: { xs: 1, sm: 1.25 },
                          borderRadius: '10px',
                          border: '1.5px solid',
                          borderColor: active ? TEAL_DARK : 'rgba(15,95,90,0.12)',
                          bgcolor: active ? 'rgba(13,148,136,0.08)' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.25,
                          minWidth: 0,
                          '&:hover': { borderColor: TEAL_DARK, bgcolor: 'rgba(13,148,136,0.05)' },
                        }}
                      >
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                          <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: active ? TEAL_DARK : 'rgba(15,95,90,0.12)', color: active ? '#ffffff' : INK, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {tab.num}
                          </Box>
                          <Typography sx={{ fontSize: { xs: 11.5, sm: 12 }, fontWeight: 800, color: active ? TEAL_DARK : 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {tab.name}
                          </Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 10, color: active ? INK : 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pl: { xs: 0, sm: 3 } }}>
                          {tab.sub}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Conteúdo do marcador */}
              <Box sx={{ p: { xs: 2, sm: 3 } }}>
                <Box sx={{ mb: 2.25 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.75} sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: 'text.primary', lineHeight: 1.3 }}>{data.markerName}</Typography>
                    <Chip label="Laudo Sabin · 02/10/2026" size="small" sx={{ height: 22, fontSize: 10.5, fontWeight: 600, bgcolor: 'rgba(0,0,0,0.05)', color: 'text.secondary', flexShrink: 0 }} />
                  </Stack>
                  <Box sx={{ bgcolor: 'rgba(15,95,90,0.04)', border: '1px solid rgba(15,95,90,0.08)', borderRadius: '10px', px: 1.5, py: 1, mt: 0.5 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.primary', lineHeight: 1.5 }}>
                      <strong style={{ color: INK }}>Contexto do Atleta:</strong> {data.patientContext}
                    </Typography>
                  </Box>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.25} sx={{ mb: 2.5 }}>
                  <Stack direction="row" alignItems="baseline" spacing={0.75}>
                    <Typography sx={{ fontSize: { xs: 30, sm: 36 }, fontWeight: 900, color: 'text.primary', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.val}</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.secondary' }}>{data.unit}</Typography>
                  </Stack>
                  <Box sx={{ px: 1.5, py: 0.6, borderRadius: '8px', bgcolor: data.statusBg, color: data.statusColor, fontWeight: 800, fontSize: { xs: 11.5, sm: 12.5 }, display: 'inline-flex', alignItems: 'center', gap: 0.75, lineHeight: 1.3 }}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: data.statusColor, flexShrink: 0 }} />
                    {data.status}
                  </Box>
                </Stack>

                {/* Régua de camadas — meta do médico em COBRE (paleta da casa; roxo fora) */}
                <Box sx={{ mb: 2.5, bgcolor: '#fbfcfd', p: { xs: 1.5, sm: 2 }, borderRadius: '12px', border: '1px solid #eef2f6' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.75} sx={{ mb: 1.25 }}>
                    <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.primary' }}>Régua do Dr. Exame</Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#cbd5e1' }} />
                        <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>Lab Convencional</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: COPPER }} />
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: COPPER }}>Meta do seu médico</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: TEAL_DARK }} />
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEAL_DARK }}>Seu Laudo</Typography>
                      </Stack>
                    </Stack>
                  </Stack>

                  <Box sx={{ position: 'relative', height: 12, bgcolor: '#e2e8f0', borderRadius: '999px', my: 1.5 }}>
                    <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: data.rulerLabLeft, width: data.rulerLabWidth, bgcolor: '#94a3b8', opacity: 0.65, borderRadius: '999px' }} />
                    <Box sx={{ position: 'absolute', top: -2, bottom: -2, left: data.rulerTargetLeft, width: data.rulerTargetWidth, border: `1.5px solid ${COPPER}`, bgcolor: 'rgba(212,165,116,0.16)', borderRadius: '999px' }} />
                    <Box sx={{ position: 'absolute', top: -5, left: data.rulerPinLeft, width: 6, height: 22, bgcolor: TEAL_DARK, borderRadius: '3px', transform: 'translateX(-50%)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', transition: 'left 0.3s ease' }} />
                  </Box>

                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.5} sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{data.labRef}</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: COPPER }}>{data.targetRef}</Typography>
                  </Stack>
                </Box>

                <Box sx={{ bgcolor: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: '12px', p: { xs: 1.75, sm: 2 }, mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.75 }}>
                    <AutoAwesomeIcon sx={{ fontSize: 16, color: TEAL_DARK, mt: 0.2 }} />
                    <Typography sx={{ fontWeight: 800, fontSize: 13, color: TEAL_DARK }}>Interpretação com contexto:</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: 'text.primary', lineHeight: 1.6 }}>{data.explanation}</Typography>
                </Box>

                <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ bgcolor: '#ffffff', p: 1.5, borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981', flexShrink: 0, mt: 0.2 }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
                    <strong style={{ color: '#0f172a' }}>Ação recomendada:</strong> {data.tip}
                  </Typography>
                </Stack>
              </Box>

              <Box sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                  🔒 Conformidade com a LGPD · Dados isolados e protegidos por criptografia de ponta a ponta.
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* CTA único + link p/ variante completa (dual-audience: compact não domina) */}
          <Box sx={{ bgcolor: '#ffffff', borderRadius: '16px', p: { xs: 2.5, sm: 3.5 }, border: '1px solid rgba(15,95,90,0.1)', textAlign: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center" useFlexGap>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={() => navigate('/registrar')}
                sx={{ borderRadius: '999px', px: 4, py: 1.4, fontWeight: 800, fontSize: 15, textTransform: 'none', boxShadow: '0 8px 24px rgba(32,178,170,0.3)' }}
              >
                Analisar meus exames grátis
              </Button>
              {!full && (
                <Box
                  component="a"
                  href="#/?sports=1"
                  sx={{ fontSize: 14.5, fontWeight: 700, color: TEAL_DARK, textDecoration: 'underline', textDecorationColor: 'rgba(23,143,137,.35)', textUnderlineOffset: 3, '&:hover': { color: INK } }}
                >
                  Ver a página completa pra quem treina →
                </Box>
              )}
              {full && onGoDemo && (
                <Button variant="outlined" color="primary" size="large" onClick={onGoDemo} sx={{ borderRadius: '999px', px: 3, py: 1.4, fontWeight: 700, fontSize: 15, textTransform: 'none' }}>
                  Testar agora com meu exame
                </Button>
              )}
            </Stack>
            {full && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 2 }}>
                Baseado em diretrizes SBEM 2026, Endocrine Society e EFLM — cada explicação cita a fonte no app.
              </Typography>
            )}
          </Box>
        </Container>
      </Box>
    </Reveal>
  );
};
