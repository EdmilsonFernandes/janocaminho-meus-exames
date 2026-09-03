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
  { id: 'endpoint-normalize', label: 'POST /meds/normalize' },
  { id: 'endpoint-prices', label: 'GET /meds/prices' },
  { id: 'endpoint-interactions', label: 'GET /meds/interactions' },
  { id: 'endpoint-extract', label: 'POST /exams/extract' },
  { id: 'endpoint-interpret', label: 'POST /exams/interpret' },
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
      <Box component="pre" sx={{ m: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.6, color: '#e8eef0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</Box>
    </Box>
  );
};

/** Tabela de parâmetros no padrão wiki — responsiva no mobile. */
const Params = ({ rows }: { rows: [string, string, string][] }) => (
  <Box sx={{ borderRadius: '12px', border: '1px solid', borderColor: 'divider', overflow: 'hidden', my: 1 }}>
    <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '1.6fr 1fr 3fr', bgcolor: 'action.hover', px: 1.5, py: 0.75 }}>
      {['Propriedade', 'Tipo', 'Descrição'].map((h) => <Typography key={h} sx={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: 'text.secondary' }}>{h}</Typography>)}
    </Box>
    {rows.map((r, idx) => (
      <Box key={r[0]} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.6fr 1fr 3fr' }, px: 1.5, py: 1, borderTop: idx ? '1px solid' : 'none', borderColor: 'divider', gap: { xs: 0.5, sm: 0 } }}>
        <Typography sx={{ fontSize: 12.5, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#178f89', wordBreak: 'break-all' }}>{r[0]}</Typography>
        <Typography sx={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'text.secondary' }}>{r[1]}</Typography>
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

const EndpointDoc = ({ id, title, desc, method, path, params, paramsLabel, curl, curlLabel = 'Exemplo', response }: { id: string; title: string; desc: string; method: string; path: string; params: [string, string, string][]; paramsLabel?: string; curl: string; curlLabel?: string; response: string }) => (
  <Card id={id} variant="outlined" sx={{ borderRadius: '14px', mb: 2.5, scrollMarginTop: 90 }}>
    <CardContent sx={{ p: { xs: 2, md: 3 } }}>
      <Typography sx={{ fontWeight: 800, fontSize: 17, mb: 0.75 }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 14, mb: 1.5, lineHeight: 1.6 }}>{desc}</Typography>
      <Method m={method} path={path} />
      <Typography sx={{ fontWeight: 800, fontSize: 12.5, mt: 2, mb: 0.5 }}>{paramsLabel ?? 'Parâmetros (query)'}</Typography>
      <Params rows={params} />
      <Typography sx={{ fontWeight: 800, fontSize: 12.5, mt: 2, mb: 0.5 }}>{curlLabel}</Typography>
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
    <Box sx={{ background: 'background.default', minHeight: '100vh', py: { xs: 2.5, md: 4 }, pb: { xs: 10, sm: 5 } }}>
      <Container maxWidth="lg">
        {/* HERO */}
        <Box sx={{
          position: 'relative', overflow: 'hidden', mb: 3, borderRadius: '18px', p: { xs: 2.5, md: 3.5 },
          background: 'linear-gradient(135deg,#0f5f5a 0%,#137a72 55%,#178f89 100%)', color: '#fff',
        }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.35)', display: 'grid', placeItems: 'center' }}>
              <ApiIcon sx={{ fontSize: 28 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: { xs: 19, md: 25 }, lineHeight: 1.15 }}>API do Dr. Exame · v1.2</Typography>
              <Typography sx={{ fontSize: 13, opacity: 0.9, mt: 0.5, lineHeight: 1.45 }}>
                Preço real de medicamentos em farmácias brasileiras + interações D/X + motores de laudo (extração e interpretação). Feito pra devs, documentado pra humanos.
              </Typography>
            </Box>
            <Stack direction={{ xs: 'row', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0, pt: { xs: 1, sm: 0 } }}>
              <Button onClick={() => navigate('/')}
                sx={{ flex: { xs: 1, sm: 'none' }, borderRadius: '999px', px: 2.5, textTransform: 'none', fontWeight: 700, color: '#fff', borderColor: 'rgba(255,255,255,.45)', '&:hover': { bgcolor: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.7)' } }} variant="outlined">
                ← Início
              </Button>
              <Button component="a" href="/api/docs" target="_blank" rel="noopener noreferrer" startIcon={<TerminalIcon />}
                sx={{ flex: { xs: 1, sm: 'none' }, borderRadius: '999px', px: { xs: 2, sm: 3 }, textTransform: 'none', fontWeight: 800, bgcolor: '#fff', color: '#178f89', '&:hover': { bgcolor: '#f0fafa' }, boxShadow: '0 10px 24px rgba(0,0,0,.18)', whiteSpace: 'nowrap' }}>
                Console
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* NAVEGAÇÃO MOBILE (chips com rolagem horizontal) */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, overflowX: 'auto', pb: 1.5, mb: 2, mx: -1, px: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
          {SECTIONS.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              onClick={() => { document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(s.id); }}
              sx={{
                flexShrink: 0, fontWeight: 700, fontSize: 12,
                bgcolor: active === s.id ? '#178f89' : 'rgba(32,178,170,.12)',
                color: active === s.id ? '#fff' : '#178f89',
                border: '1px solid', borderColor: active === s.id ? '#178f89' : 'rgba(32,178,170,.25)',
              }}
            />
          ))}
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
                  { n: 1, t: 'Crie sua conta no Dr. Exame', d: 'O acesso à API é por conta: cadastro grátis no app.' },
                  { n: 2, t: 'Solicite o acesso', d: 'Perfil → "API para desenvolvedores" → informe empresa e o que vai construir. Leva minutos.' },
                  { n: 3, t: 'Aprovação libera o teste', d: 'Você recebe push e e-mail na hora, com 25 chamadas de teste.' },
                  { n: 4, t: 'Crie sua chave', d: 'No painel: "+ Nova chave" (guardada só com você, exibida uma única vez).' },
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
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1.5 }}>Limites e códigos de erro</Typography>
              <Stack spacing={1} sx={{ mb: 1.5 }}>
                <Chip label="Dado de varejo: zero dado pessoal de saúde (LGPD)" size="small" sx={{ fontWeight: 700 }} />
              </Stack>
              <Params rows={[
                ['401', 'erro', 'Chave ausente ou inválida (header x-api-key).'],
                ['402', 'erro', 'Saldo de chamadas esgotado: a resposta traz os pacotes disponíveis pra recarga.'],
                ['403', 'erro', 'Solicitação pendente ou rejeitada.'],
                ['429', 'erro', 'Rate limit (60/min) atingido: tente em instantes.'],
                ['500', 'erro', 'Erro interno do servidor.'],
              ]} />
            </Box>

            {/* ENDPOINTS */}
            <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1.5 }}>Endpoints da v1</Typography>

            <EndpointDoc
              id="endpoint-meds"
              title="Pesquisar catálogo de medicamentos"
              desc="Pesquisa no catálogo por nome, marca ou princípio ativo. Cada resultado traz o melhor preço cacheado, foto e EAN: leitura instantânea do cache (nunca dispara busca na farmácia)."
              method="GET" path="/meds"
              params={[
                ['q', 'string · obrigatório', 'Nome ou princípio ativo (mínimo 2 letras). Ex.: dipirona, levoide, rosuvastatina.'],
                ['limit', 'number · opcional', 'Quantidade máxima (1-50, padrão 20).'],
              ]}
              curl={`curl "${BASE}/meds?q=dipirona&limit=2" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}
              response={`{
  "total": 45,
  "items": [
    {
      "id": "med_123",
      "name": "DIPIRONA SÓDICA 500MG/ML",
      "activeIngredient": "DIPIRONA SODICA",
      "bestPriceCents": 490,
      "offersCount": 8,
      "ean": "7896004701234"
    }
  ]
}`}
            />

            <EndpointDoc
              id="endpoint-prices"
              title="Consultar preços em farmácias"
              desc="Snapshot de preços coletados das farmácias para o princípio ativo (+apresentação opcional), com ofertas ordenadas do menor preço. O campo stale avisa quando a coleta passa de 6h: quem consome decide se usa."
              method="GET" path="/meds/prices"
              params={[
                ['activeIngredient', 'string · obrigatório', 'Princípio ativo em maiúsculas. Ex.: DIPIRONA SODICA, LEVOTIROXINA.'],
                ['dosage', 'string · opcional', 'Dose exata. Ex.: 75MCG, 500MG.'],
                ['form', 'string · opcional', 'Forma farmacêutica. Ex.: CP (comprimido), GTS (gotas), XPE.'],
              ]}
              curl={`curl "${BASE}/meds/prices?activeIngredient=LEVOTIROXINA&dosage=75MCG" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}
              response={`{
  "activeIngredient": "LEVOTIROXINA",
  "dosage": "75MCG",
  "offers": [
    {
      "pharmacy": "Pague Menos",
      "productName": "Levoid 75mcg 30 Comprimidos",
      "priceCents": 1290,
      "url": "https://...",
      "fetchedAt": "2026-08-26T10:00:00Z"
    }
  ],
  "lowestPriceCents": 1290,
  "stale": false
}`}
            />

            <EndpointDoc
              id="endpoint-interactions"
              title="Checar interações medicamento × medicamento (D/X)"
              desc="Cruzamento determinístico de bula: você envia a lista de princípios ativos e a API responde as interações conhecidas por grau de severidade (GRAVE, MODERADA, LEVE). Baseada no banco de interações ANVISA/FDA."
              method="GET" path="/meds/interactions"
              params={[
                ['meds', 'string · obrigatório', 'Lista separada por vírgula. Ex.: "WARFARINA,ASPIRINA" ou "SINVASTATINA,AMIODARONA".'],
              ]}
              curl={`curl "${BASE}/meds/interactions?meds=WARFARINA,ASPIRINA" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui"`}
              response={`{
  "query": ["WARFARINA", "ASPIRINA"],
  "interactionsCount": 1,
  "hasSevere": true,
  "interactions": [
    {
      "pair": ["WARFARINA", "ASPIRINA"],
      "severity": "GRAVE",
      "effect": "Aumento significativo do risco de sangramento.",
      "disclaimer": "Informativo: nunca substitui a checagem do farmacêutico/médico."
    }
  ]
}`}
            />

            <EndpointDoc
              id="endpoint-normalize"
              title="Normalizar nome de medicamento"
              desc={'O usuário digita de qualquer jeito: "Dorflex 10cp", linha de receita, "levotirox 75". Este endpoint devolve a chave canônica (princípio ativo + dose + forma + embalagem), resolvendo marca → genérico (Levoid → Levotiroxina). É a mesma chave que os endpoints de preço usam: normalize e compare no mesmo fôlego.'}
              method="POST" path="/meds/normalize"
              paramsLabel="Corpo (JSON)"
              params={[
                ['text', 'string · obrigatório', 'Texto livre como veio do usuário. Ex.: "Dorflex Analgésico e Relaxante Muscular 10 comprimidos".'],
                ['packQty', 'number · opcional', 'Embalagem conhecida (senão o parser infere do texto).'],
                ['includePrices', 'boolean · opcional', 'true = inclui o melhor preço cacheado do ingrediente na resposta.'],
              ]}
              curl={`curl -X POST "${BASE}/meds/normalize" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Levoid 75mcg","includePrices":true}'`}
              response={`{
  "input": "Levoid 75mcg",
  "brandResolved": { "from": "LEVOID", "to": "LEVOTIROXINA" },
  "activeIngredient": "LEVOTIROXINA",
  "dosage": { "value": 75, "unit": "MCG" },
  "form": "CP",
  "packQty": null,
  "medicationKey": "LEVOTIROXINA|75MCG|CP|?",
  "comparable": false,
  "prices": { "lowestPriceCents": 765, "offersCount": 11 }
}`}
            />

            <EndpointDoc
              id="endpoint-extract"
              title="Extrair laudo (PDF/foto/texto → JSON)"
              desc={'A joia do Dr. Exame como serviço: envie o laudo laboratorial e receba o JSON estruturado: painéis, itens, valores, unidades, faixas de referência e a página-fonte de cada dado. Funciona com PDF, foto ou texto puro. Nada é armazenado: você envia, a gente estrutura e devolve (LGPD: o documento é seu, nós só processamos).'}
              method="POST" path="/exams/extract"
              paramsLabel="Envio (multipart OU JSON)"
              params={[
                ['file', 'arquivo · multipart', 'PDF ou foto do laudo (campo file do multipart/form-data).'],
                ['text', 'string · JSON', 'Alternativa ao arquivo: o conteúdo textual do laudo (mín. 50 caracteres).'],
              ]}
              curl={`curl -X POST "${BASE}/exams/extract" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui" \\\n  -F "file=@laudo.pdf"`}
              curlLabel="Exemplo (PDF)"
              response={`{
  "exams": [
    {
      "examTitle": "HEMOGRAMA + TIREOIDE",
      "sourceLab": "Lab Central",
      "performedAt": "2026-08-01",
      "panels": [
        { "name": "TIREOIDE", "items": [
          { "name": "TSH", "valueText": "7,32", "valueNumeric": 7.32, "unit": "µUI/mL",
            "references": [{ "appliesTo": "Adultos", "lowNumeric": 0.4, "highNumeric": 4.0 }],
            "page": 1 }
        ] }
      ]
    }
  ],
  "itemCount": 23,
  "charged": 20,
  "disclaimer": "Estruturação automática (IA) do documento ENVIADO POR VOCÊ..."
}`}
            />

            <EndpointDoc
              id="endpoint-interpret"
              title="Interpretar valor × faixa de referência"
              desc={'O motor determinístico do app: cada item vira flag + tom + rótulo com grau. ">20% além do limite" já é "Muito acima" (tom crítico). LDL e Colesterol não-HDL sem faixa viram "depende do contexto clínico" (metas por risco cardiovascular), e sem faixa a API nunca inventa rótulo. Você envia a faixa do laudo de origem; a régua é nossa. Zero IA na chamada: resposta em milissegundos.'}
              method="POST" path="/exams/interpret"
              paramsLabel="Corpo (JSON)"
              params={[
                ['items', 'array · obrigatório', '1-200 itens: { name, value, refLow?, refHigh? }. A faixa é a do laudo de origem.'],
              ]}
              curl={`curl -X POST "${BASE}/exams/interpret" \\\n  -H "x-api-key: dxk_live_sua_chave_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"items":[{"name":"TSH","value":4.4,"refLow":0.4,"refHigh":4.0},{"name":"Hemoglobina","value":14,"refLow":12,"refHigh":16}]}'`}
              response={`{
  "items": [
    { "name": "TSH", "value": 4.4, "refLow": 0.4, "refHigh": 4.0,
      "flag": "HIGH", "tone": "atencao", "label": "Acima da referência" },
    { "name": "Hemoglobina", "value": 14.0, "refLow": 12, "refHigh": 16,
      "flag": "NORMAL", "tone": "normal", "label": "Dentro da referência" }
  ],
  "summary": { "total": 2, "altered": 1, "critical": 0 },
  "disclaimer": "Comparação determinística valor × faixa ENVIADA POR VOCÊ. Educativo: nunca diagnóstico."
}`}
            />

            {/* PACOTES */}
            <Box id="pacotes" sx={{ scrollMarginTop: 90 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1 }}>Pacotes e preços</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 14, mb: 2, lineHeight: 1.6 }}>
                Pré-pago, sem surpresa: cada chamada de dados debita 1 do saldo (a extração de laudo debita <b>20</b>: motor de IA por trás, e falha da nossa parte = reembolso automático). Recarga por PIX (QR na hora), cartão ou débito: a aprovação da sua solicitação já vem com <b>25 chamadas de teste</b>.
              </Typography>
              <Params rows={[
                ['Teste grátis', 'R$ 0', '25 chamadas — concedido na aprovação.'],
                ['Profissional', 'R$ 99,00', '10.000 chamadas (R$ 0,01 por chamada) = 500 extrações: o mais pedido.'],
                ['Grande volume', 'R$ 399,00', '50.000 chamadas (R$ 0,008 por chamada) = 2.500 extrações.'],
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
                Meus Exames — dado educativo de varejo farmacêutico. Não é recomendação médica (linha ANVISA RDC 657). Dúvidas: <Box component="a" href="mailto:contato@janocaminho.com.br" sx={{ fontWeight: 700, color: 'primary.dark', textDecoration: 'underline' }}>contato@janocaminho.com.br</Box>.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};
