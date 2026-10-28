#!/usr/bin/env node
// ── IMPORT CNES/DATASUS → directory_facilities/professionals (28/10/26) ────────────
// Catálogo público oficial ("achar médico perto de você"). Pipeline:
//
//   1. BAIXAR (na EC2 — a rede de dev bloqueia gov.br) os .dbc do espelho S3 público:
//        ESTABELECIMENTOS: https://datasus-ftp-mirror.nyc3.cdn.digitaloceanspaces.com/dissemin/publicos/CNES/202406/ESTBEF/CNESSP2406.dbc
//        PROFISSIONAIS:    .../dissemin/publicos/CNES/202406/PROFEF/PFSP2406.dbc
//      (ajustar UF+YYMM; conferir mês disponível na listagem do espelho)
//   2. CONVERTER .dbc→CSV (na EC2, python3):
//        pip3 install pyreaddbc pandas
//        python3 -c "from pyreaddbc import read_dbc; read_dbc('CNESSP2406.dbc','est.csv')"
//        python3 -c "from pyreaddbc import read_dbc; read_dbc('PFSP2406.dbc','pf.csv')"
//   3. IMPORTAR (aqui ou na EC2, apontando o DATABASE_URL alvo):
//        DATABASE_URL=... node scripts/cnes-import.mjs --facilities est.csv \
//          --professionals pf.csv --municipios municipios.json --city "são josé dos campos"
//
// Idempotente POR REGIÃO: re-import da mesma cidade substitui as linhas antigas.
// CSV DATASUS: separador ';', aspas duplas, LATIN1 (decodificamos aqui).
// Mapeamento de colunas é TOLERANTE (o layout varia por década de arquivo).
import { readFileSync } from 'fs';
import { argv, exit } from 'process';

// --- args ---
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const facilitiesCsv = arg('facilities');
const professionalsCsv = arg('professionals');
const municipiosJson = arg('municipios');
const cityFilter = arg('city'); // nome (sem acento ok) — filtrar por cidade/região
const ufFilter = (arg('uf') || '').toUpperCase();
const dryRun = argv.includes('--dry-run');
if (!facilitiesCsv || !professionalsCsv || !municipiosJson || !cityFilter) {
  console.error('uso: --facilities est.csv --professionals pf.csv --municipios municipios.json --city "nome" [--uf SP] [--dry-run]');
  exit(1);
}

const deaccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pick = (row, keys) => { for (const k of keys) { const hit = Object.keys(row).find((c) => c.toUpperCase() === k); if (hit && String(row[hit]).trim()) return String(row[hit]).trim(); } return ''; };

// --- CSV parser (latin1, ';' separador, aspas) ---
function parseCsv(file) {
  const text = Buffer.from(readFileSync(file, { encoding: 'binary' }), 'latin1').toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}
function splitLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ';' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// --- municípios: código IBGE 6d → nome (mirror kelvins tem codigo_ibge) ---
const munis = JSON.parse(readFileSync(municipiosJson, 'utf8').replace(/^﻿/, ''));
const muniByCode = new Map(munis.map((m) => [String(m.codigo_ibge), m.nome]));
const CITY_WANT = deaccent(cityFilter);

// --- estabelecimentos ---
const facs = parseCsv(facilitiesCsv)
  .map((r) => {
    const code = pick(r, ['cnesCode', 'CO_CNES', 'CNES', 'CNES_COD']);
    if (!code) return null;
    const city = pick(r, ['city', 'NO_MUNICIPIO', 'MUNICIPIO', 'MUNNOME'])
      || muniByCode.get(pick(r, ['CO_MUNICIPIO_GESTOR', 'CODMUN', 'CO_MUNICIPIO']).slice(0, 6)) || '';
    const uf = (pick(r, ['uf', 'SG_UF', 'UF', 'UFMUN']).slice(0, 2) || ufFilter).toUpperCase();
    return {
      cnesCode: code,
      name: pick(r, ['name', 'NO_FANTASIA', 'NOMEFANT', 'FANTASIA']) || pick(r, ['NO_RAZAO_SOCIAL', 'RAZSOC', 'RAZAO_SOCIAL']) || 'Estabelecimento de saúde',
      city: city.replace(/\s*-\s*[A-Z]{2}$/, ''),
      uf,
      address: pick(r, ['address']) || [pick(r, ['DS_LOGRADOURO', 'NO_LOGRADOURO', 'LOGRADOURO']), pick(r, ['NU_ENDERECO', 'NUMERO'])].filter(Boolean).join(', ') || null,
      district: pick(r, ['district', 'NO_BAIRRO', 'BAIRRO']) || null,
      phone: (pick(r, ['phone', 'NU_TELEFONE', 'TELEFONE']) || '').replace(/\D/g, '') || null,
      lat: pick(r, ['lat', 'NU_LATITUDE', 'LATITUDE']) || null,
      lng: pick(r, ['lng', 'NU_LONGITUDE', 'LONGITUDE']) || null,
      facilityTyp: pick(r, ['facilityTyp', 'TP_UNID', 'TIPO_UNIDADE']) || null,
    };
  })
  .filter((f) => f && deaccent(f.city).includes(CITY_WANT) && (!ufFilter || f.uf === ufFilter));
console.log(`facilities na região "${cityFilter}": ${facs.length}`);
if (!facs.length) { console.error('nenhum estabelecimento — confira filtro/layout'); exit(1); }

// --- profissionais (vínculo por CNES; CRM/conselho quando o CNES traz) ---
const facByCode = new Map(facs.map((f) => [f.cnesCode, f]));
const profs = parseCsv(professionalsCsv)
  .map((r) => {
    const cnes = pick(r, ['cnesCode', 'CO_CNES', 'CNES', 'CNES_COD']);
    const name = pick(r, ['name', 'NO_PROFISSIONAL', 'NOMEPROF', 'PROFISSIONAL', 'NO_PROF']);
    if (!cnes || !name || !facByCode.has(cnes)) return null;
    return {
      cnes, name,
      cboCode: pick(r, ['cboCode', 'CO_CBO', 'CBO']) || null,
      cboName: pick(r, ['cboName', 'NO_CBO', 'DS_CBO', 'CBO_DESC']) || null,
      councilType: pick(r, ['councilType', 'CO_CONSELHO_CLASSE']) || null,
      councilUf: pick(r, ['councilUf', 'SG_UF_CRM']) || null,
      councilReg: pick(r, ['councilReg', 'NU_REGISTRO']) || null,
    };
  })
  .filter(Boolean);
console.log(`profissionais vinculados: ${profs.length}`);
if (dryRun) { console.log('dry-run — amostra:', JSON.stringify(facs[0]), JSON.stringify(profs[0])); exit(0); }

// --- grava (idempotente por região) ---
const { PrismaClient } = await import('../src/generated/prisma/client.js').catch(() => import('@prisma/client'));
const prisma = new PrismaClient();
const importedAt = new Date();
const cityNames = [...new Set(facs.map((f) => f.city))];
try {
  await prisma.$transaction(async (tx) => {
    // remove a região alvo (cascade leva os professionals) e recria
    await tx.directoryFacility.deleteMany({ where: { city: { in: cityNames }, ...(ufFilter ? { uf: ufFilter } : {}) } });
    const created = await tx.directoryFacility.createMany({
      data: facs.map((f) => ({ ...f, source: 'cnes', importedAt, updatedAt: importedAt })),
    });
    const facIdByCode = new Map(
      (await tx.directoryFacility.findMany({ where: { city: { in: cityNames } }, select: { id: true, cnesCode: true } }))
        .map((f) => [f.cnesCode, f.id]),
    );
    let profCount = 0;
    const CHUNK = 2000;
    for (let i = 0; i < profs.length; i += CHUNK) {
      const rows = profs.slice(i, i + CHUNK)
        .map((p) => ({ facilityId: facIdByCode.get(p.cnes)!, name: p.name, cboCode: p.cboCode, cboName: p.cboName, councilType: p.councilType, councilUf: p.councilUf, councilReg: p.councilReg, source: 'cnes', importedAt }))
        .filter((p) => p.facilityId);
      if (rows.length) profCount += (await tx.directoryProfessional.createMany({ data: rows })).count;
    }
    console.log(`OK: ${created.count} estabelecimentos, ${profCount} profissionais (região: ${cityNames.join(', ')})`);
  });
} finally { await prisma.$disconnect(); }
