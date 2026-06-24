/** Especialidades médicas comuns no Brasil + convênios. */
export const SPECIALTIES = [
  'Clinico Geral', 'Cardiologista', 'Endocrinologista', 'Gastroenterologista',
  'Ginecologista', 'Hematologista', 'Neurologista', 'Ortopedista', 'Pneumologista',
  'Psiquiatra', 'Reumatologista', 'Urologista', 'Dermatologista', 'Oftalmologista',
  'Otorrinolaringologista', 'Pediatra', 'Geriatra', 'Oncologista', 'Nefrologista',
  'Infectologista', 'Hepatologista', 'Cirurgiao Geral', 'Angiologista', 'Nutrologista',
  'Medico do Trabalho', 'Medico de Familia', 'Outro',
];

export const CONVENIOS = [
  'Particular', 'Unimed', 'Bradesco Saude', 'SulAmerica', 'AMIL',
  'NotreDame Intermedica', 'HapVida', 'Porto Seguro', 'Golden Cross',
  'Amil Dental', 'Bio Saude', 'Cassi', 'Geap', 'Outro',
];

/** Unidades federativas (UF) — pro dropdown do CRM ao compartilhar c/ médico. */
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

/** Agrupamento por categoria médica (estilo laudo: Hemograma, Função Hepática, etc.) */
export const CATS: { key: string; cat: string; emoji: string; color: string; keys: string[] }[] = [
  { key: 'glic', cat: 'Glicemia e Diabetes', emoji: '🍩', color: '#db2777', keys: ['glicose', 'glicemi', 'glicosilada', 'glicosada', 'hba1c', 'insulina', 'homa', 'frutosam'] },
  { key: 'hemo', cat: 'Hemograma', emoji: '🩸', color: '#e11d48', keys: ['hemoglo', 'hematoc', 'eritroc', 'eritróc', 'leucoc', 'leucóc', 'plaque', 'vcm', 'hcm', 'chcm', 'rdw', 'neutro', 'linfoc', 'linfóc', 'monoc', 'eosinofi', 'basofi', 'hemácia', 'hemacia', 'reticuloc', 'vpm', 'cgm', 'rhc'] },
  { key: 'lipi', cat: 'Lipídios e Colesterol', emoji: '🧈', color: '#d97706', keys: ['colesterol', 'ldl', 'hdl', 'vldl', 'triglic', 'apolipo', 'castelli', 'nao-hdl', 'não-hdl'] },
  { key: 'hepa', cat: 'Função Hepática', emoji: '🫀', color: '#16a34a', keys: ['tgo', 'tgp', 'ast', 'alt', 'gama-gt', 'gama gt', 'ggt', 'gamagt', 'fosfatase alcalin', 'bilirrub', 'transamin', 'albumina'] },
  { key: 'renal', cat: 'Função Renal', emoji: '🫘', color: '#7c3aed', keys: ['creatinina', 'ureia', 'uréia', 'acido urico', 'ácido úrico', 'tfg', 'egfr', 'depura', 'clearance', 'cistatina'] },
  { key: 'horm', cat: 'Hormônios', emoji: '⚗️', color: '#0891b2', keys: ['tsh', 't4 livre', 't3 livre', 'tiroxina', 'triiodo', 'tireotropina', 'tireo', 'paratorm', 'testosterona', 'cortisol', 'prolactina', 'estradiol', 'androst', 'dhea', 'progester', 'hormônio', 'hormonio'] },
  { key: 'card', cat: 'Marcadores Cardíacos', emoji: '❤️', color: '#dc2626', keys: ['troponina', 'creatino quinase', 'ck-mb', 'ck mb', 'ckmb', 'ldh', 'desidrogenase', 'bnp', 'pro-bnp', 'mioglo'] },
  { key: 'elet', cat: 'Eletrólitos e Minerais', emoji: '⚡', color: '#0d9488', keys: ['sodio', 'sódio', 'potassio', 'potássio', 'calcio', 'cálcio', 'magnesio', 'magnésio', 'cloro', 'cloret', 'fosforo', 'fósforo'] },
  { key: 'infl', cat: 'Inflamação e Ferro', emoji: '🛡️', color: '#ea580c', keys: ['pcr', 'vhs', 'proteina c reativa', 'proteína c reativa', 'ferritina', 'ferro', 'saturacao', 'saturação', 'transferr', 'tibc', 'uibc'] },
  { key: 'coag', cat: 'Coagulação', emoji: '🩹', color: '#9333ea', keys: ['protrombina', 'inr', 'ttpa', 'fibrinogen', 'fibrinogên', 'tromboplastina', 'tempo de tromb', 'coagul'] },
  { key: 'vita', cat: 'Vitaminas e Ácido Fólico', emoji: '💊', color: '#2563eb', keys: ['vitamina', 'acido folico', 'ácido fólico', 'folato', 'homociste'] },
  { key: 'other', cat: 'Outros exames', emoji: '📋', color: '#64748b', keys: [] },
];

/** Categoriza um analito pelo nome (canônico). Cai em 'Outros' se não bater nenhuma regra. */
export const categorize = (name: string) => {
  const n = (name || '').toLowerCase();
  for (const c of CATS) if (c.key !== 'other' && c.keys.some((k) => n.includes(k))) return c;
  return CATS.find((c) => c.key === 'other')!;
};

/**
 * Label pronto pra exibir da faixa de referência de um item/exame.
 * - Com faixa (refText ou refLow/refHigh): "Ref: 3,5 - 5,0 mUI/L".
 * - Sem faixa nenhuma: "sem faixa de referência" (em vez do confuso "Ref: —").
 */
export const refLabel = (it: any): string => {
  if (it?.refText) return `Ref: ${it.refText}`;
  const lo = it?.refLow, hi = it?.refHigh;
  if (lo != null || hi != null) {
    const range = (lo != null && hi != null) ? `${lo} - ${hi}` : `${lo ?? hi}`;
    return it?.unit ? `Ref: ${range} ${it.unit}` : `Ref: ${range}`;
  }
  return 'sem faixa de referência';
};
