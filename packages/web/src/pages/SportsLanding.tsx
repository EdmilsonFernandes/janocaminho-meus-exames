import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, Button, Stack, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import SpeedIcon from '@mui/icons-material/Speed';
import ScienceIcon from '@mui/icons-material/Science';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShieldIcon from '@mui/icons-material/Shield';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useNavigate } from 'react-router-dom';

const TEAL = '#20b2aa';
const TEAL_DARK = '#178f89';
const INK = '#0f5f5a';
const SERIF_I = { fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic', fontWeight: 400 } as const;

// 4 Cenários Clínicos Demonstrativos Reais
const sportsScenarios = {
  ck: {
    id: 'ck',
    title: 'CK Total & TGO pós-treino',
    badge: 'Músculo vs. Fígado',
    patientContext: 'Treino pesado de pernas (esforço excêntrico intenso) realizado há 24h',
    markerName: 'Creatina Quinase (CK Total)',
    val: '1.420',
    unit: 'U/L',
    status: 'Dano Muscular Fisiológico',
    statusBg: 'rgba(13,148,136,0.12)',
    statusColor: '#0f766e',
    labRef: 'Lab Convencional: 30 a 200 U/L',
    targetRef: 'Variação esperada pós-treino (contexto)',
    rulerLabLeft: '5%',
    rulerLabWidth: '20%',
    rulerTargetLeft: '25%',
    rulerTargetWidth: '55%',
    rulerPinLeft: '68%',
    explanation: 'Leitura provável: elevação por microrrupturas musculares do treino de ontem — e não lesão hepática (TGP e Gama-GT normais). A literatura (EFLM) mostra CK elevada por até 5–7 dias após esforço intenso. Confirmar com o médico é o próximo passo, não um alarme.',
    action: 'Hidratação reforçada (>3,5L/dia) e descanso antes de solicitar nova dosagem para não falsear dados.'
  },
  renal: {
    id: 'renal',
    title: 'Creatinina vs. Cistatina-C',
    badge: 'Função Renal Real',
    patientContext: 'Praticante de musculação com alta massa muscular + Creatina Monoidratada 5g/dia',
    markerName: 'Cistatina-C (Filtração Glomerular)',
    val: '0,78',
    unit: 'mg/L',
    status: 'Função renal preservada',
    statusBg: 'rgba(16,185,129,0.12)',
    statusColor: '#047857',
    labRef: 'Lab Convencional: 0,55 a 1,02 mg/L',
    targetRef: 'Meta do seu médico (exemplo)',
    rulerLabLeft: '15%',
    rulerLabWidth: '50%',
    rulerTargetLeft: '20%',
    rulerTargetWidth: '40%',
    rulerPinLeft: '45%',
    explanation: 'A creatinina do laudo acusou 1,35 mg/dL — falso positivo clássico de massa muscular e suplementação de creatina. A cistatina-C não depende do músculo e mostra função renal preservada (o grupo HAARLEM, JCEM 2026, recomenda o marcador nesse perfil).',
    action: 'Leve este comparativo ao médico antes de aceitar qualquer suspensão arbitrária de treinos ou suplementação.'
  },
  trt: {
    id: 'trt',
    title: 'Hematócrito & Viscosidade (TRT)',
    badge: 'Segurança Cardiovascular',
    patientContext: 'Homem de 34 anos em reposição hormonal de testosterona (TRT)',
    markerName: 'Hematócrito (Concentração de Hemácias)',
    val: '51,8',
    unit: '%',
    status: 'Zona de atenção: 48% a 54%',
    statusBg: 'rgba(245,158,11,0.12)',
    statusColor: '#b45309',
    labRef: 'Lab Convencional: 40% a 50%',
    targetRef: 'Zona de atenção clínica: 48% a 54%',
    rulerLabLeft: '15%',
    rulerLabWidth: '45%',
    rulerTargetLeft: '35%',
    rulerTargetWidth: '30%',
    rulerPinLeft: '78%',
    explanation: '51,8% está na zona de atenção (48–54%) em que desidratação, altitude e treino intenso também elevam o valor. Acima de 54%, diretrizes SBEM 2026 e Endocrine Society indicam protocolo médico — decisão de quem prescreveu. Não espere o 54% para organizar a conversa.',
    action: 'Aumente o consumo de líquidos para 4L/dia, meça a pressão arterial e apresente este alerta ao seu endocrinologista.'
  },
  ferro: {
    id: 'ferro',
    title: 'Ferritina & Estoque de Ferro',
    badge: 'Endurance & VO2 Máx',
    patientContext: 'Corredora de rua / maratonista com cansaço e queda de ritmo nos treinos longos',
    markerName: 'Ferritina Sérica',
    val: '24',
    unit: 'ng/mL',
    status: 'Reservas de ferro baixas',
    statusBg: 'rgba(239,68,68,0.12)',
    statusColor: '#b91c1c',
    labRef: 'Lab Convencional: 10 a 120 ng/mL',
    targetRef: 'Meta do seu médico (exemplo)',
    rulerLabLeft: '10%',
    rulerLabWidth: '70%',
    rulerTargetLeft: '45%',
    rulerTargetWidth: '45%',
    rulerPinLeft: '22%',
    explanation: 'O laboratório marca "normal" acima de 10 ng/mL, mas a referência da SBH 2024 considera reservas baixas abaixo de 30 ng/mL — e fadiga em treinos longos é a queixa clássica desse quadro. Investigar e repor é conduta médica.',
    action: 'Investigar reposição de ferro elementar ou coadjuvantes nutricionais com seu médico do esporte.'
  }
};

export const SportsLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'ck' | 'renal' | 'trt' | 'ferro'>('ck');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.title = 'Dr. Exame • Saúde Esportiva & Exames para Atletas e Musculação';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scenario = sportsScenarios[activeTab];

  return (
    <Box sx={{ bgcolor: '#f8fafc', minHeight: '100vh', color: 'text.primary' }}>
      {/* NAVBAR PÚBLICA */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 100,
        bgcolor: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(15,95,90,0.1)',
        py: 1.5,
        transition: 'all 0.2s ease'
      }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Box component="img" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="Dr. Exame" sx={{ width: 36, height: 36, borderRadius: '14%' }} />
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: 18, color: 'text.primary', lineHeight: 1.1 }}>Dr. Exame</Typography>
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: TEAL_DARK, letterSpacing: '0.04em' }}>MODO SAÚDE ESPORTIVA</Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button onClick={() => navigate('/')} sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}>
              Página Principal
            </Button>
            <Button onClick={() => navigate('/entrar')} sx={{ color: INK, fontWeight: 700, textTransform: 'none' }}>
              Entrar
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/registrar')}
              sx={{ borderRadius: '999px', px: 2.5, textTransform: 'none', fontWeight: 800 }}
            >
              Criar Conta Grátis
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* HERO SECTION ESPORTIVA */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(240,250,249,0.8) 0%, #f8fafc 100%)',
        pt: { xs: 6, md: 10 }, pb: { xs: 7, md: 10 },
        borderBottom: '1px solid rgba(15,95,90,0.08)'
      }}>
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <Chip
            icon={<FitnessCenterIcon sx={{ fontSize: 17 }} />}
            label="Medicina Esportiva & Performance Inteligente"
            sx={{
              bgcolor: 'rgba(13,148,136,0.12)',
              color: TEAL_DARK,
              fontWeight: 800,
              fontSize: 13,
              mb: 2.5,
              pl: 1,
              '& .MuiChip-icon': { color: TEAL_DARK }
            }}
          />
          <Typography variant="h1" sx={{
            fontSize: { xs: '2.1rem', sm: '3rem', md: '3.6rem' },
            fontWeight: 900,
            color: 'text.primary',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            maxWidth: 920,
            mx: 'auto',
            mb: 2.5
          }}>
            Você treina. Seus exames merecem <Box component="span" sx={{ ...SERIF_I, color: TEAL_DARK }}>interpretação esportiva.</Box>
          </Typography>
          <Typography sx={{
            fontSize: { xs: 16, sm: 19 },
            color: 'text.secondary',
            maxWidth: 760,
            mx: 'auto',
            lineHeight: 1.6,
            mb: 4
          }}>
            Os laboratórios convencionais comparam seus exames com a média de pessoas sedentárias. No Dr. Exame, seus laudos são avaliados no contexto do seu treino, sua suplementação e sua rotina de performance — sem alarmismos nem falsos diagnósticos.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mb: 5 }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate('/registrar')}
              endIcon={<ArrowForwardIcon />}
              sx={{
                bgcolor: TEAL_DARK,
                borderRadius: '999px',
                px: 4, py: 1.6,
                fontSize: 16, fontWeight: 800,
                textTransform: 'none',
                boxShadow: '0 8px 24px rgba(23,143,137,0.3)',
                '&:hover': { bgcolor: INK }
              }}
            >
              Começar Grátis com Créditos de Presente
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => {
                const el = document.getElementById('simulador');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              sx={{
                borderRadius: '999px',
                px: 3.5, py: 1.6,
                fontSize: 15, fontWeight: 700,
                borderColor: 'rgba(15,95,90,0.25)',
                color: INK,
                textTransform: 'none'
              }}
            >
              Testar Simulador Interativo
            </Button>
          </Stack>

          {/* Selos de Confiança */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="center" alignItems="center" sx={{ fontSize: 13, color: 'text.secondary' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981' }} />
              <span>Sem cartão de crédito no cadastro</span>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <ShieldIcon sx={{ fontSize: 18, color: TEAL_DARK }} />
              <span>Privacidade LGPD · Zero julgamento clínico</span>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScienceIcon sx={{ fontSize: 18, color: '#6366f1' }} />
              <span>Baseado em diretrizes SBEM 2026 e Endocrine Society</span>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* SEÇÃO DO SIMULADOR INTERATIVO */}
      <Box id="simulador" sx={{ py: { xs: 8, md: 11 }, bgcolor: '#ffffff' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Chip label="Demonstração Prática" sx={{ bgcolor: 'rgba(32,178,170,0.1)', color: TEAL_DARK, fontWeight: 700, mb: 1.5, fontSize: 12 }} />
            <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' }, fontWeight: 800, mb: 1.5, letterSpacing: '-0.02em' }}>
              Veja como o Dr. Exame interpreta o exame de um atleta
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 16, maxWidth: 660, mx: 'auto' }}>
              Selecione um caso abaixo e veja a régua de 4 camadas diferenciando o laudo convencional da meta real de performance:
            </Typography>
          </Box>

          {/* CARD DO SIMULADOR RESPONSIVO */}
          <Box sx={{
            maxWidth: 820,
            mx: 'auto',
            bgcolor: '#ffffff',
            borderRadius: '20px',
            border: '1.5px solid rgba(15,95,90,0.15)',
            boxShadow: '0 12px 36px rgba(15,95,90,0.08)',
            overflow: 'hidden'
          }}>
            {/* Header da Persona */}
            <Box sx={{
              p: { xs: 2.5, sm: 3 },
              bgcolor: 'rgba(240,250,249,0.7)',
              borderBottom: '1px solid rgba(15,95,90,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5
            }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{
                  width: 42, height: 42, borderRadius: '12px',
                  bgcolor: TEAL_DARK, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 16
                }}>
                  RS
                </Box>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Rodrigo Silva, 31 anos</Typography>
                    <Chip label="Atleta Ativo" size="small" sx={{ height: 20, fontSize: 10, fontWeight: 800, bgcolor: 'rgba(13,148,136,0.15)', color: TEAL_DARK }} />
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Fisiculturismo Classic / Treinos de Alta Intensidade</Typography>
                </Box>
              </Stack>
              <Chip
                icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                label="Modo Saúde Esportiva Ativo"
                sx={{ height: 26, fontSize: 11, fontWeight: 700, bgcolor: '#ffffff', color: TEAL_DARK, border: '1px solid rgba(13,148,136,0.3)' }}
              />
            </Box>

            {/* Grid de Alternância de Casos */}
            <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, bgcolor: '#fbfcfd', borderBottom: '1px solid rgba(15,95,90,0.08)' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', mb: 1.25, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Selecione o cenário clínico do atleta:
              </Typography>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
                gap: 1
              }}>
                {[
                  { id: 'ck', num: '1', name: 'CK pós-treino', sub: 'Músculo vs. Fígado' },
                  { id: 'renal', num: '2', name: 'Cistatina-C', sub: 'Função Renal Real' },
                  { id: 'trt', num: '3', name: 'Hematócrito', sub: 'TRT & Viscosidade' },
                  { id: 'ferro', num: '4', name: 'Ferritina', sub: 'Estoque / Corrida' },
                ].map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <Box
                      key={item.id}
                      component="button"
                      type="button"
                      onClick={() => setActiveTab(item.id as any)}
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
                        '&:hover': { borderColor: TEAL_DARK, bgcolor: 'rgba(13,148,136,0.04)' }
                      }}
                    >
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{
                          width: 18, height: 18, borderRadius: '50%',
                          bgcolor: active ? TEAL_DARK : 'rgba(15,95,90,0.12)',
                          color: active ? '#ffffff' : INK,
                          fontSize: 10, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {item.num}
                        </Box>
                        <Typography sx={{ fontSize: { xs: 11.5, sm: 12 }, fontWeight: 800, color: active ? TEAL_DARK : 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 10, color: active ? INK : 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pl: { xs: 0, sm: 3 } }}>
                        {item.sub}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Conteúdo do Exame */}
            <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              {/* Header do Marcador */}
              <Box sx={{ mb: 2.25 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.75} sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 800, color: 'text.primary', lineHeight: 1.3 }}>
                    {scenario.markerName}
                  </Typography>
                  <Chip label="Laudo Sabin · 02/10/2026" size="small" sx={{ height: 22, fontSize: 10.5, fontWeight: 600, bgcolor: 'rgba(0,0,0,0.05)', color: 'text.secondary' }} />
                </Stack>

                <Box sx={{ bgcolor: 'rgba(15,95,90,0.04)', border: '1px solid rgba(15,95,90,0.08)', borderRadius: '10px', px: 1.5, py: 1, mt: 0.5 }}>
                  <Typography sx={{ fontSize: 12, color: 'text.primary', lineHeight: 1.5 }}>
                    <strong style={{ color: INK }}>Contexto do Atleta:</strong> {scenario.patientContext}
                  </Typography>
                </Box>
              </Box>

              {/* Valor e Badge */}
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.25} sx={{ mb: 2.5 }}>
                <Stack direction="row" alignItems="baseline" spacing={0.75}>
                  <Typography sx={{ fontSize: { xs: 32, sm: 38 }, fontWeight: 900, color: 'text.primary', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {scenario.val}
                  </Typography>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.secondary' }}>
                    {scenario.unit}
                  </Typography>
                </Stack>
                <Box sx={{ px: 1.5, py: 0.6, borderRadius: '8px', bgcolor: scenario.statusBg, color: scenario.statusColor, fontWeight: 800, fontSize: { xs: 11.5, sm: 12.5 }, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: scenario.statusColor }} />
                  {scenario.status}
                </Box>
              </Stack>

              {/* Régua de 4 Camadas */}
              <Box sx={{ mb: 2.5, bgcolor: '#fbfcfd', p: { xs: 1.5, sm: 2 }, borderRadius: '12px', border: '1px solid #eef2f6' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.75} sx={{ mb: 1.25 }}>
                  <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.primary' }}>Régua Fisiológica de 4 Camadas (Dr. Exame)</Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#cbd5e1' }} />
                      <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>Lab Convencional</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#b88a54' }} />
                      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#b88a54' }}>Meta do seu médico</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: TEAL_DARK }} />
                      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEAL_DARK }}>Seu Laudo</Typography>
                    </Stack>
                  </Stack>
                </Stack>

                <Box sx={{ position: 'relative', height: 12, bgcolor: '#e2e8f0', borderRadius: '999px', my: 1.5 }}>
                  <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: scenario.rulerLabLeft, width: scenario.rulerLabWidth, bgcolor: '#94a3b8', opacity: 0.65, borderRadius: '999px' }} />
                  <Box sx={{ position: 'absolute', top: -2, bottom: -2, left: scenario.rulerTargetLeft, width: scenario.rulerTargetWidth, border: '1.5px solid #b88a54', bgcolor: 'rgba(212,165,116,0.16)', borderRadius: '999px' }} />
                  <Box sx={{ position: 'absolute', top: -5, left: scenario.rulerPinLeft, width: 6, height: 22, bgcolor: TEAL_DARK, borderRadius: '3px', transform: 'translateX(-50%)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', transition: 'left 0.3s ease' }} />
                </Box>

                <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{scenario.labRef}</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#b88a54' }}>{scenario.targetRef}</Typography>
                </Stack>
              </Box>

              {/* Explicação da IA */}
              <Box sx={{ bgcolor: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: '12px', p: { xs: 1.75, sm: 2 }, mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.75 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 16, color: TEAL_DARK, mt: 0.2 }} />
                  <Typography sx={{ fontWeight: 800, fontSize: 13, color: TEAL_DARK }}>Interpretação do Dr. Exame:</Typography>
                </Stack>
                <Typography sx={{ fontSize: 13.5, color: 'text.primary', lineHeight: 1.6 }}>{scenario.explanation}</Typography>
              </Box>

              {/* Ação Prática */}
              <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ bgcolor: '#ffffff', p: 1.5, borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981', flexShrink: 0, mt: 0.2 }} />
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                  <strong style={{ color: '#0f172a' }}>Conduta orientada:</strong> {scenario.action}
                </Typography>
              </Stack>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* 4 GUIAS EDUCATIVOS DE ALTA INTENÇÃO DE BUSCA DO GOOGLE */}
      <Box sx={{ py: { xs: 8, md: 11 }, bgcolor: '#f8fafc', borderTop: '1px solid #eef2f6' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Chip icon={<ScienceIcon sx={{ fontSize: 16 }} />} label="Conhecimento Baseado em Evidências" sx={{ bgcolor: 'rgba(99,102,241,0.1)', color: '#4f46e5', fontWeight: 700, mb: 1.5, fontSize: 12 }} />
            <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 800, mb: 1.5, letterSpacing: '-0.02em' }}>
              O que você precisa saber sobre seus exames esportivos
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 16, maxWidth: 680, mx: 'auto' }}>
              Perguntas frequentes que atletas, fisiculturistas e maratonistas levam ao consultório do médico do esporte:
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3, mb: 6 }}>
            {[
              {
                title: 'Creatina e Creatinina: Qual a diferença no laudo?',
                desc: 'A creatina monoidratada se converte naturalmente em fosfocreatina e creatinina. Quem treina pesado e toma creatina gera mais creatinina circulante simplesmente por ter maior densidade muscular. Isso provoca um falso alerta de falência renal no exame de rotina. Nesses casos, a Cistatina-C é o padrão-ouro para confirmar que os rins continuam 100% filtrantes.',
                tag: 'Função Renal & Suplementação'
              },
              {
                title: 'CK alta após o treino de perna: Músculo ou Fígado?',
                desc: 'Treinos intensos com contração excêntrica geram microrrupturas na membrana das células musculares, liberando Creatina Quinase (CK) e a enzima TGO. A CK pode permanecer elevada por 5–7 dias após esforço muito intenso (recomendação EFLM de coleta sem exercício nas 24h anteriores). Para ter certeza de que o fígado está saudável, o Dr. Exame verifica se TGP e Gama-GT continuam estáveis.',
                tag: 'Dano Muscular Fisiológico'
              },
              {
                title: 'Hematócrito alto em TRT e Reposição Hormonal: Como prevenir?',
                desc: 'A testosterona estimula a produção de glóbulos vermelhos pela medula óssea (eritropoiese). Em atletas e pacientes em TRT, entre 48% e 54% é zona de atenção contextualizada; acima de 54%, diretrizes SBEM 2026 e Endocrine Society indicam protocolo médico. Hidratação reforçada (>3,5L/dia) é essencial.',
                tag: 'Redução de Danos & TRT'
              },
              {
                title: 'Ferritina baixa e oxigenação em corredores (Endurance)',
                desc: 'Mesmo com hemoglobina normal, atletas de corrida sofrem perda de ferro devido ao impacto repetitivo nos vasos dos pés (hemólise por impacto) e sudorese intensa. No laudo comum, ferritina de 15 ng/mL é chamada de "normal", mas a referência da SBH 2024 considera reservas baixas abaixo de 30 ng/mL — quadro clássico de fadiga em treinos longos.',
                tag: 'Corrida & Transporte de O2'
              }
            ].map((guide, i) => (
              <Box
                key={i}
                sx={{
                  bgcolor: '#ffffff',
                  p: { xs: 2.75, sm: 3.5 },
                  borderRadius: '16px',
                  border: '1px solid rgba(15,95,90,0.1)',
                  boxShadow: '0 4px 16px rgba(15,95,90,0.03)'
                }}
              >
                <Chip label={guide.tag} size="small" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,95,90,0.08)', color: INK, mb: 1.5 }} />
                <Typography variant="h3" sx={{ fontSize: 18, fontWeight: 800, color: 'text.primary', mb: 1.5, lineHeight: 1.35 }}>
                  {guide.title}
                </Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.65 }}>
                  {guide.desc}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* COMO FUNCIONA EM 3 PASSOS */}
      <Box sx={{ py: { xs: 8, md: 10 }, bgcolor: '#ffffff' }}>
        <Container maxWidth="md">
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <Typography variant="h2" sx={{ fontSize: { xs: '1.8rem', md: '2.3rem' }, fontWeight: 800, mb: 1.5 }}>
              Como começar seu monitoramento esportivo
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 15 }}>
              Tudo funciona pelo celular ou computador em menos de 2 minutos:
            </Typography>
          </Box>

          <Stack spacing={2.5}>
            {[
              { num: '01', title: 'Envie seu exame (PDF ou foto de celular)', desc: 'Você pode subir o arquivo original do laboratório ou tirar uma foto com a câmera. Nossa IA lê os valores automaticamente em segundos.' },
              { num: '02', title: 'Ative o Modo Saúde Esportiva', desc: 'Indique sua modalidade (musculação, corrida, crossfit ou TRT) e registre suplementos em uso com total sigilo protegido por criptografia.' },
              { num: '03', title: 'Receba seu painel com a régua de 4 camadas', desc: 'Veja cada marcador desmistificado, entenda o que é resposta fisiológica do treino e leve uma lista de perguntas inteligentes para sua consulta médica.' }
            ].map((step, idx) => (
              <Box key={idx} sx={{ p: 2.5, bgcolor: '#fbfcfd', borderRadius: '14px', border: '1px solid #eef2f6', display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
                <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: 'rgba(13,148,136,0.1)', color: TEAL_DARK, fontWeight: 900, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.num}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 16, color: 'text.primary', mb: 0.5 }}>{step.title}</Typography>
                  <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.55 }}>{step.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>

          {/* CTA FINAL DE CONVERSÃO */}
          <Box sx={{ mt: 6, p: { xs: 3, sm: 4 }, bgcolor: 'rgba(240,250,249,0.9)', borderRadius: '20px', border: '1.5px solid rgba(13,148,136,0.3)', textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 800, mb: 1.5, color: 'text.primary' }}>
              Seus treinos são sérios. Seus exames também devem ser.
            </Typography>
            <Typography sx={{ fontSize: 15, color: 'text.secondary', maxWidth: 560, mx: 'auto', mb: 3 }}>
              Crie sua conta agora e ganhe créditos de IA para analisar seus primeiros laudos gratuitamente.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate('/registrar')}
              sx={{
                bgcolor: TEAL_DARK,
                borderRadius: '999px',
                px: 4.5, py: 1.6,
                fontWeight: 800, fontSize: 16,
                textTransform: 'none',
                boxShadow: '0 8px 24px rgba(23,143,137,0.35)',
                '&:hover': { bgcolor: INK }
              }}
            >
              Criar Conta Grátis & Ativar Modo Esporte
            </Button>
          </Box>
        </Container>
      </Box>

      {/* FOOTER & AVISO LEGAL */}
      <Box sx={{ py: 6, bgcolor: '#0f172a', color: '#94a3b8', fontSize: 12, borderTop: '1px solid #1e293b' }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box component="img" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="Dr. Exame" sx={{ width: 28, height: 28, borderRadius: '12%' }} />
              <Typography sx={{ color: '#ffffff', fontWeight: 800, fontSize: 15 }}>Dr. Exame</Typography>
            </Stack>
            <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ color: '#94a3b8', fontSize: 13 }}>
              <Box component="button" onClick={() => navigate('/')} sx={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', '&:hover': { color: '#fff' } }}>Início</Box>
              <Box component="button" onClick={() => navigate('/como-funciona')} sx={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', '&:hover': { color: '#fff' } }}>Como Funciona</Box>
              <Box component="button" onClick={() => navigate('/doctor')} sx={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', '&:hover': { color: '#fff' } }}>Para Médicos</Box>
              <Box component="button" onClick={() => navigate('/termos')} sx={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', '&:hover': { color: '#fff' } }}>Termos</Box>
              <Box component="button" onClick={() => navigate('/privacidade')} sx={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', '&:hover': { color: '#fff' } }}>Privacidade (LGPD)</Box>
            </Stack>
          </Stack>
          <Typography sx={{ lineHeight: 1.6, textAlign: { xs: 'left', sm: 'center' }, opacity: 0.8 }}>
            Aviso de Responsabilidade Médica: O Dr. Exame é uma ferramenta tecnológica de organização e educação em saúde. Nenhuma análise ou régua gráfica substitui a consulta médica, o diagnóstico clínico ou o acompanhamento profissional presencial. Nunca altere medicamentos ou dosagens hormonais sem orientação do seu médico.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
};
