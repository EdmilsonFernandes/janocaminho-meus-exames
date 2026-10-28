#!/usr/bin/env node
// ── CNES prepare: do ZIP oficial (BASE_DE_DADOS_CNES_<YYMM>.zip) → CSVs da região ──
// Processa em STREAM (arquivos nacionais chegam a ~1GB) e emite os 2 CSVs no formato
// do cnes-import.mjs. Pipelines das tabelas (competência 202609 confirmada):
//   tbMunicipio            → CO_MUNICIPIO → nome + UF (não precisa de fonte externa)
//   tbEstabelecimento      → facilities (CO_MUNICIPIO_GESTOR = cidade alvo)
//   tbCargaHorariaSus      → vínculos por CO_UNIDADE (CO_PROFISSIONAL_SUS, CO_CBO,
//                            NU_REGISTRO/SG_UF_CRM — CRM quando há!)
//   tbDadosProfissionalSus → nome do profissional
//   tbAtividadeProfissional→ nome do CBO
// uso: node scripts/cnes-prepare.mjs --dir C:/Users/esantos/Downloads/cnes \
//        --cmpt 202609 --city "são josé dos campos" --uf SP --out ./out-sjc
import { createReadStream, writeFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { argv, exit } from 'process';

const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const dir = arg('dir');
const cmpt = arg('cmpt') || '202609';
const cityArg = arg('city');
const uf = (arg('uf') || '').toUpperCase();
const outDir = arg('out') || './out-cnes';
if (!dir || !cityArg) {
  console.error('uso: --dir <pasta com os csv> --cmpt 202609 --city "são josé dos campos" [--uf SP] [--out pasta]');
  exit(1);
}
const deaccent = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const CITY = deaccent(cityArg);

const csv = (f) => `${dir}/${f.replace('{cmpt}', cmpt)}.csv`;
const unq = (v) => String(v ?? '').replace(/^"|"$/g, '').trim();

// parser streaming de CSV latin1 com cabeçalho → gera objetos {col: valor}
async function* rows(file) {
  const rl = createInterface({ input: createReadStream(file).setEncoding('latin1'), crlfDelay: Infinity });
  let header = null;
  let buf = '';
  for await (const line of rl) {
    buf = buf ? `${buf}\n${line}` : line;
    const cells = [];
    let cur = '', inQ = false, complete = true;
    for (let i = 0; i < buf.length; i++) {
      const ch = buf[i];
      if (ch === '"') { if (inQ && buf[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ';' && !inQ) { cells.push(cur); cur = ''; }
      else if (ch === '\n' && !inQ) { cells.push(cur); cur = ''; break; }
      else cur += ch;
    }
    if (inQ || (cur !== '' && cells.length && buf[buf.length - 1] !== '\n')) { complete = false; }
    if (!complete) continue;
    const final = cur;
    if (!header) { header = cells.map(unq); buf = ''; continue; }
    const row = {};
    header.forEach((h, i) => { row[h] = unq(cells[i] ?? ''); });
    yield row;
    buf = '';
  }
}

// 1. município alvo (código IBGE)
let cityCode = null, cityName = '', cityUf = uf;
for await (const r of rows(csv('tbMunicipio{cmpt}'))) {
  if (deaccent(r.NO_MUNICIPIO).includes(CITY) && (!uf || r.CO_SIGLA_ESTADO === uf)) {
    cityCode = r.CO_MUNICIPIO; cityName = r.NO_MUNICIPIO; cityUf = r.CO_SIGLA_ESTADO; break;
  }
}
if (!cityCode) { console.error(`município não achado: ${cityArg}`); exit(1); }
console.log(`município: ${cityName}/${cityUf} (IBGE ${cityCode})`);

// 2. facilities da cidade (ativas: sem motivo de desativação)
const facilities = [];
const unitToCnes = new Map();
for await (const r of rows(csv('tbEstabelecimento{cmpt}'))) {
  if (r.CO_MUNICIPIO_GESTOR !== cityCode) continue;
  if (r.CO_MOTIVO_DESAB) continue; // desativado
  const cnes = r.CO_CNES || r.CO_UNIDADE;
  unitToCnes.set(r.CO_UNIDADE, cnes);
  facilities.push({
    cnesCode: cnes,
    name: r.NO_FANTASIA || r.NO_RAZAO_SOCIAL || 'Estabelecimento de saúde',
    city: cityName, uf: cityUf,
    address: [r.NO_LOGRADOURO, r.NU_ENDERECO, r.NO_COMPLEMENTO].filter(Boolean).join(', ') || null,
    district: r.NO_BAIRRO || null,
    phone: (r.NU_TELEFONE || '').replace(/\D/g, '') || null,
    lat: r.NU_LATITUDE || null, lng: r.NU_LONGITUDE || null,
    facilityTyp: r.TP_UNIDADE || r.CO_TIPO_ESTABELECIMENTO || null,
  });
}
console.log(`facilities ativas: ${facilities.length}`);
if (!facilities.length) exit(1);

// 3. vínculos por CO_UNIDADE (com CBO e CRM quando existir)
const cboNames = new Map();
for await (const r of rows(csv('tbAtividadeProfissional{cmpt}'))) {
  cboNames.set(r.CO_CBO, r.DS_ATIVIDADE_PROFISSIONAL);
}
const profIds = new Set();
const vinculos = [];
for await (const r of rows(csv('tbCargaHorariaSus{cmpt}'))) {
  const cnes = unitToCnes.get(r.CO_UNIDADE);
  if (!cnes) continue;
  vinculos.push({ cnes, profId: r.CO_PROFISSIONAL_SUS, cbo: r.CO_CBO || null, council: r.CO_CONSELHO_CLASSE || null, ufCouncil: r.SG_UF_CRM || null, reg: r.NU_REGISTRO || null });
  profIds.add(r.CO_PROFISSIONAL_SUS);
}
console.log(`vínculos: ${vinculos.length} (${profIds.size} profissionais únicos)`);

// 4. nomes (stream no arquivo grande)
const names = new Map();
for await (const r of rows(csv('tbDadosProfissionalSus{cmpt}'))) {
  if (profIds.has(r.CO_PROFISSIONAL_SUS)) names.set(r.CO_PROFISSIONAL_SUS, r.NO_PROFISSIONAL);
}
console.log(`nomes resolvidos: ${names.size}`);

// 5. emit CSVs no formato do cnes-import.mjs
mkdirSync(outDir, { recursive: true });
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
writeFileSync(`${outDir}/facilities.csv`, 'cnesCode;name;city;uf;address;district;phone;lat;lng;facilityTyp\n'
  + facilities.map((f) => [f.cnesCode, f.name, f.city, f.uf, f.address, f.district, f.phone, f.lat, f.lng, f.facilityTyp].map(esc).join(';')).join('\n'));
writeFileSync(`${outDir}/professionals.csv`, 'cnesCode;name;cboCode;cboName;councilType;councilUf;councilReg\n'
  + vinculos.filter((v) => names.has(v.profId)).map((v) => [v.cnes, names.get(v.profId), v.cbo, v.cbo ? cboNames.get(v.cbo) ?? null : null, v.council, v.ufCouncil, v.reg].map(esc).join(';')).join('\n'));
console.log(`OK → ${outDir}/facilities.csv + ${outDir}/professionals.csv`);
