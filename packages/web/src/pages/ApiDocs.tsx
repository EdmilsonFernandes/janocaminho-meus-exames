import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DrExame } from '../components/DrExame';
import ApiIcon from '@mui/icons-material/Api';
import KeyIcon from '@mui/icons-material/Key';
import BoltIcon from '@mui/icons-material/Bolt';
import TerminalIcon from '@mui/icons-material/Terminal';

/**
 * Portal de documentação da API (estilo wiki — inspirado no plug&play da Minu, mas com o
 * que FALTA nele: códigos de erro, limites e o COMO SOLICITAR acesso, que é o nosso funil).
 * Público (#/api-docs). O Swagger (/api/docs) vira o "console interativo" complementar.
 */

const BASE = 'https://drexame.janocaminho.com.br/api/public/v1';

const SECTIONS = [
  { id: 'como-comecar', label: 'Como começar' },
  { id: 'autenticacao', label: 'Autenticação' },
  { id: 'limites', label: 'Limites e erros' },
  { id: 'endpoint-meds', label: 'GET /meds' },
  { id: 'endpoint-prices', label: 'GET /meds/prices' },
  { id: 'endpoint-interactions', label: 'GET /meds/interactions' },
  { id: 'pacotes', label: 'Pacotes e preços' },
] as const;

/** Bloco de código com copiar (o curl vira copia-e-cola pronto). */
const Code = ({ children, lang }: { children: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ position: 'relative', borderRadius: '12px', bgcolor: '#0c2422', border: '1px solid rgba(32,178,170,.25)', p: 2, my: 1, overflowX: 'auto' }}>
      {lang && <Chip size="small" label={lang} sx={{ position: 'absolute', top: 8, right: 46, height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(32,178,170,.2)', color: '#7ee2d8' }} />}
      <Button size="small" onClick={() => { void navigator.clipboard?.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        sx={{ position: 'absolute', top: 6, right: 8, minWidth: 0, px: 1, color: copied ? '#7ee2d8' : 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}>
        {copied ? 'copiado ✓' : 'copiar'}
      </Button>
      <Box component="pre" sx={{ m: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.7, color: '#e8eef0', whiteSpace: 'pre', }}>{children}</Box>
    </Box>
  );
};

/** Tabela de parâmetros no padrão wiki (Propriedade / Tipo / Descrição) — grid, sem <table>. */
const Params = ({ rows }: { rows: [string, string, string][] }) => (
  <Box sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', overflow: 'hidden', my: 1 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.6fr 1fr 3fr' }, bgcolor: 'action.hover', px: 1.5, py: 0.75 }}>
      {['Propriedade', 'Tipo', 'Descrição'].map((h) => <Typography key={h} sx={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: 'text.secondary' }}>{h}</Typography>)}
    </Box>
    {rows.map((r, idx) => (
      <Box key={r[0]} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.6fr 1fr 3fr' }, px: 1.5, py: 1, borderTop: idx ? '1px solid' : 'none', borderColor: 'divider' }}>
        <Typography sx={{ fontSize: 12.5, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#178f89', wordBreak: 'break-all' }}>{r[0]}</Typography>
        <Typography sx={{ fontSize: 12.5, fontFamily: 'ui-monospace, monospace', color: 'text.secondary' }}>{r[1]}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>{r[2]}</Typography>
      </Box>
    ))}
  </Box>
);

const Method = ({ m, path }: { m: string; path: string }) => (
  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
    <Chip label={m} size="small" sx={{ height: 22, fontWeight: 800, fontSize: 11, bgcolor: m === 'GET' ? 'rgba(5,150,105,.14)' : 'rgba(59,130,246,.14)', color: m === 'GET' ? '#047857' : '#1d4ed8' }} />
    <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, wordBreak: 'break-all' }}>{BASE}{path}</Typography>
  </Stack>
);

const EndpointDoc = ({ id, title, desc, method, path, params, curl, response }: { id: string; title: string; desc: string; method: string; path: string; params: [string, string, string][]; curl: string; response: string }) => (
  <Card id={id} variant="outlined" sx={{ borderRadius: '14px', mb: 2.5, scrollMarginTop: 90 }}>
    <CardContent sx={{ p: { xs: 2, md: 3 } }}>
      <Typography sx={{ fontWeight: 800, fontSize: 17, mb: 0.75 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 14, mb: 1.5, lineHeight: 1.6 }}>{desc}</Typography>
      <Method m={method} path={path} />
      <Typography sx={{ fontWeight: 800, fontSize: 12.5, mt: 2, mb: 0.5 }}>Parâmetros (query)</Typography>
      <Params rows={params} />
      <Typography sx={{ fontWeight: 800, fontSize: 12.5, mt: 2, mb: 0.5 }}>Exemplo</Typography>
      <Code lang="bash">{curl}</Code>
      <Typography sx={{ fontWeight: 800, fontSize: 12.5, mt: 1.5, mb: 0.5 }}>Resposta 200</Typography>
      <Code lang="json">{response}</Code>
    </CardContent>
  </Card>
);

export const ApiDocsPage = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState<string>('como-comecar');
  useEffect(() => {
    const onScroll = () => {
      let cur: string = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < 140) cur = s.id;
      }
      setActive(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <Box sx={{ background: 'background.default', minHeight: '100vh', py: { xs: 2.5, md: 4 } }}>
      <Container maxWidth="lg">
        {/* HERO */}
        <Box sx={{
          position: 'relative', overflow: 'hidden', mb: 3, borderRadius: '18px', p: { xs: 2.5, md: 3.5 },
          background: 'linear-gradient(135deg,#0f5f5a 0%,#137a72 55%,#178f89 100%)', color: '#fff',
        }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 64, height: 64, flexShrink: 0, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.35)', display: 'grid', placeItems: 'center' }}>
              <ApiIcon sx={{ fontSize: 30 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 20, md: 25 }, lineHeight: 1.15 }}>API do Dr. Exame · v1</Typography>
              <Typography sx={{ fontSize: 13.5, opacity: 0.9, mt: 0.5 }}>
                Preço real de medicamentos em farmácias brasileiras + interações D/X. Feito pra devs, documentado pra humanos.
              </Typography>
            </Box>
            <Button component="a" href="/api/docs" target="_blank" rel="noopener noreferrer" startIcon={<TerminalIcon />}
              sx={{ flexShrink: 0, borderRadius: '999px', px: { xs: 2, sm: 3 }, textTransform: 'none', fontWeight: 800, bgcolor: '#fff', color: '#178f89', '&:hover': { bgcolor: '#f0fafa' }, boxShadow: '0 10px 24px rgba(0,0,0,.18)' }}>
              Console interativo
            </Button>
          </Stack>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '230px 1fr' }, gap: 3, alignItems: 'start' }}>
          {/* SIDEBAR wiki (desktop) */}
          <Box component="nav" sx={{ display: { xs: 'none', md: 'block' }, position: 'sticky', top: 90 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'text.secondary', mb: 1 }}>NESTA PÁGINA</Typography>
            <Stack spacing={0.5}>
              {SECTIONS.map((s) => (
                <Box key={s.id} component="button"
                  onClick={() => { document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(s.id); }}
                  sx={{ display: 'block', textAlign: 'left', py: 0.6, px: 1.5, borderRadius: '8px', border: 'none', bgcolor: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: active === s.id ? 800 : 600, color: active === s.id ? '#178f89' : 'text.secondary', ...(active === s.id ? { bgcolor: 'rgba(32,178,170,.10)' } : {}), borderLeft: active === s.id ? '3px solid #20b2aa' : '3px solid transparent', '&:hover': { bgcolor: 'rgba(32,178,170,.06)' } }}>
                  {s.label}
                </Box>
              ))}
            </Stack>
            <Button fullWidth variant="outlined" onClick={() => navigate('/api')} startIcon={<KeyIcon />} sx={{ mt: 2, borderRadius: '999px', textTransform: 'none', fontWeight: 800, borderColor: '#d8f4f2', color: '#178f89' }}>
              Solicitar acesso
            </Button>
          </Box>

          {/* CONTEÚDO */}
          <Box>
            {/* COMO COMEÇAR */}
            <Box id="como-comecar" sx={{ scrollMarginTop: 90, mb: 3 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1.5 }}>Como começar</Typography>
              <Stack spacing={1.25}>
                {[
                  { n: 1, t: 'Crie sua conta no Dr. Exame', d: 'O acesso à API é por conta — cadastro grátis no app.' },
                  { n: 2, t: 'Solicite o acesso', d: 'Perfil → "API para desenvolvedores" → informe empresa e o que vai construir. Leva minutos.' },
                  { n: 3, t: 'Aprovação libera o teste', d: 'Você recebe push e e-mail na hora, com 25 chamadas de teste.' },
                  { n: 4, t: 'Crie sua chave', d: 'No painel: "+ Nova chave" → guardada só com você (exibida uma única vez).' },
                  { n: 5, t: 'Faça a primeira chamada', d: 'Header x-api-key nos endpoints abaixo. Quando o teste acabar, recarregue com PIX, cartão ou débito.' },
                ].map((s) => (
                  <Stack key={s.n} direction="row" spacing={1.5} alignItems="flex-start">
                    <Box sx={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', bgcolor: 'rgba(32,178,170,.14)', color: '#178f89', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{s.n}</Box>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{s.t}</Typography>
                      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}>{s.d}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>

            {/* AUTENTICAÇÃO */}
            <Box id="autenticacao" sx={{ scrollMarginTop: 90, mb: 3 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1.5 }}>Autenticação</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 14, mb: 1, lineHeight: 1.6 }}>
                Toda chamada usa a chave no header <code style={{ fontFamily: 'ui-monospace, monospace', color: '#178f89', fontWeight: 700 }}>x-api-key</code>. A chave tem formato <code style={{ fontFamily: 'ui-monospace, monospace' }}>dxk_live_…</code>, é pessoal como senha e pode ser revogada no painel a qualquer momento.
              </Typography>
              <Code lang="bash">{`curl "${BASE}/meds?q=dipirona" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}</Code>
            </Box>

            {/* LIMITES E ERROS */}
            <Box id="limites" sx={{ scrollMarginTop: 90, mb: 3 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1.5 }}>Limites e erros</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                <Chip icon={<BoltIcon sx={{ fontSize: 15 }} />} label="60 chamadas por minuto por chave" size="small" sx={{ fontWeight: 700 }} />
                <Chip label="Saldo pré-pago: sem saldo → 402" size="small" sx={{ fontWeight: 700 }} />
                <Chip label="Dado de varejo — nada de dado pessoal de saúde (LGPD)" size="small" sx={{ fontWeight: 700 }} />
              </Stack>
              <Params rows={[
                ['401', 'erro', 'Chave ausente, inválida ou revogada.'],
                ['402', 'erro', 'Saldo de chamadas esgotado — a resposta traz os pacotes disponíveis pra recarga.'],
                ['404', 'erro', 'Recurso não encontrado (ex.: sem snapshot de preço para o termo).'],
                ['429', 'erro', 'Rate limit (60/min) atingido — tente em instantes.'],
              ]} />
            </Box>

            {/* ENDPOINTS */}
            <EndpointDoc
              id="endpoint-meds"
              title="Buscar medicamentos"
              desc="Pesquisa no catálogo por nome, marca ou princípio ativo. Cada resultado traz o melhor preço cacheado, foto e EAN — leitura instantânea do cache (nunca dispara busca na farmácia)."
              method="GET" path="/meds"
              params={[
                ['q', 'string · obrigatório', 'Termo de busca (mín. 2 caracteres). Ex.: losartana, Cozaar, dipirona.'],
              ]}
              curl={`curl "${BASE}/meds?q=losartana" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}
              response={`{
  "query": "losartana",
  "count": 1,
  "results": [
    {
      "name": "Losartana Potássica",
      "activeIngredient": "LOSARTANA POTASSICA",
      "brands": ["Cozaar"],
      "doses": ["50 mg"],
      "bestPriceCents": 989,
      "bestPharmacy": "Pague Menos",
      "ean": "7891058001231",
      "offersCount": 3
    }
  ]
}`}
            />

            <EndpointDoc
              id="endpoint-prices"
              title="Preços por farmácia"
              desc="Snapshot de preços coletados das farmácias para o princípio ativo (+apresentação opcional), com ofertas ordenadas do menor preço. O campo stale avisa quando a coleta passa de 6h — quem consome decide se usa."
              method="GET" path="/meds/prices"
              params={[
                ['ingredient', 'string · obrigatório', 'Princípio ativo (nome funciona: "dipirona"). Mín. 3 caracteres.'],
                ['dose', 'number · opcional', 'Dosagem (ex.: 500). Com dose, filtra a apresentação exata.'],
                ['unit', 'string · opcional', 'MG | MCG | ML | G (default MG).'],
              ]}
              curl={`curl "${BASE}/meds/prices?ingredient=dipirona&dose=500&unit=MG" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}
              response={`{
  "medicationKey": "DIPIRONA|500MG|CP|20",
  "lowestPriceCents": 589,
  "averagePriceCents": 742,
  "offersCount": 7,
  "stale": false,
  "collectedAt": "2026-08-25T19:00:00.000Z",
  "offers": [
    {
      "pharmacy": "Pague Menos",
      "productName": "Dipirona 500mg 20 Comprimidos",
      "priceCents": 589,
      "url": "https://www.paguemenos.com.br/...",
      "imageUrl": "https://.../foto.jpg",
      "ean": "7891058001231"
    }
  ]
}`}
            />

            <EndpointDoc
              id="endpoint-interactions"
              title="Interações entre medicamentos"
              desc="Checa todos os pares entre os remédios informados contra a base curada (marcas viram genérico: levoid → levotiroxina). Por padrão devolve só D (requer ajuste) e X (contraindicação); ?all=1 inclui A/B/C."
              method="GET" path="/meds/interactions"
              params={[
                ['drugs', 'string · obrigatório', '2+ nomes separados por vírgula. Ex.: varfarina,losartana.'],
                ['all', 'string · opcional', 'Envie "1" para incluir severidades A/B/C.'],
              ]}
              curl={`curl "${BASE}/meds/interactions?drugs=losartana,espironolactona" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}
              response={`{
  "drugs": ["LOSARTAN", "ESPIRONOLACTONA"],
  "checkedPairs": 1,
  "count": 1,
  "interactions": [
    {
      "drugA": "LOSARTAN",
      "drugB": "ESPIRONOLACTONA",
      "severity": "D",
      "effect": "Risco de potássio alto (hipercalemia).",
      "recommendation": "Monitorar potássio; sintomas como formigamento ou fraqueza merecem exame rápido."
    }
  ],
  "disclaimer": "Informativo — nunca substitui a checagem do farmacêutico/médico."
}`}
            />

            {/* PACOTES */}
            <Box id="pacotes" sx={{ scrollMarginTop: 90 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1 }}>Pacotes e preços</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 14, mb: 1.5, lineHeight: 1.6 }}>
                Pré-pago, sem surpresa: cada chamada debita 1 do saldo. Recarga por PIX (QR na hora), cartão ou débito — a aprovação da sua solicitação já vem com <b>25 chamadas de teste</b>.
              </Typography>
              <Params rows={[
                ['Teste', 'grátis', '25 chamadas, concedidas na aprovação do acesso.'],
                ['Inicial', 'R$ 19,90', '1.000 chamadas (R$ 0,02 por chamada).'],
                ['Profissional', 'R$ 99,00', '10.000 chamadas (R$ 0,01 por chamada) — o mais pedido.'],
                ['Grande volume', 'R$ 399,00', '50.000 chamadas (R$ 0,008 por chamada).'],
              ]} />
              <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
                <Button variant="contained" onClick={() => navigate('/api')} startIcon={<KeyIcon />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 800, px: 3.5 }}>
                  Solicitar acesso
                </Button>
                <Button component="a" href="/api/docs" target="_blank" rel="noopener noreferrer" startIcon={<TerminalIcon />} sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 700, px: 3.5, borderColor: '#d8f4f2', color: '#178f89' }} variant="outlined">
                  Abrir console interativo
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5 }}>
                Meus Exames — dado educativo de varejo farmacêutico. Não é recomendação médica (linha ANVISA RDC 657). Dúvidas: contato@janocaminho.com.br.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
