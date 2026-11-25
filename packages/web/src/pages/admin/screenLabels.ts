/**
 * Nome legível e área de cada tela medida (painel "Telas abertas" do admin).
 * A chave é o caminho normalizado que o app envia (ver utils/screenTracker.ts).
 * Tela nova sem entrada aqui aparece no painel com o próprio caminho — nada quebra.
 */
export type ScreenArea = 'inicio' | 'exames' | 'ia' | 'rotina' | 'medicos' | 'conta' | 'admin' | 'outros';

export const AREA_LABEL: Record<ScreenArea, string> = {
  inicio: 'Início',
  exames: 'Exames',
  ia: 'IA',
  rotina: 'Rotina e saúde',
  medicos: 'Médicos',
  conta: 'Conta',
  admin: 'Admin',
  outros: 'Outros',
};

export const SCREENS: Record<string, { label: string; area: ScreenArea }> = {
  '/': { label: 'Tela inicial', area: 'inicio' },
  '/notificacoes': { label: 'Notificações', area: 'inicio' },

  '/exams': { label: 'Lista de exames', area: 'exames' },
  '/exams/create': { label: 'Enviar exame', area: 'exames' },
  '/exams/:id/show': { label: 'Exame aberto', area: 'exames' },
  '/alterados': { label: 'Valores alterados', area: 'exames' },
  '/tendencias': { label: 'Tendências', area: 'exames' },
  '/evolucao': { label: 'Evolução', area: 'exames' },
  '/linha-do-tempo': { label: 'Linha do tempo', area: 'exames' },
  '/sinais': { label: 'Sinais de risco', area: 'exames' },

  '/chat': { label: 'Chat com IA', area: 'ia' },
  '/relatorio': { label: 'Relatório completo', area: 'ia' },
  '/alimentacao': { label: 'Alimentação e exames', area: 'ia' },

  '/medicoes': { label: 'Medições', area: 'rotina' },
  '/medicamentos': { label: 'Remédios', area: 'rotina' },
  '/lembretes': { label: 'Agenda e lembretes', area: 'rotina' },
  '/radar-hormonal': { label: 'Radar hormonal', area: 'rotina' },
  '/simulador-hormonal': { label: 'Simulador hormonal', area: 'rotina' },
  '/composicao': { label: 'Composição corporal', area: 'rotina' },
  '/saude-esportiva': { label: 'Saúde esportiva', area: 'rotina' },
  '/saude-mental': { label: 'Saúde mental', area: 'rotina' },
  '/diario': { label: 'Diário de saúde', area: 'rotina' },
  '/vacinas': { label: 'Vacinas', area: 'rotina' },
  '/despesas': { label: 'Gastos', area: 'rotina' },
  '/emergencia': { label: 'Cartão de emergência', area: 'rotina' },

  '/medicos': { label: 'Meus médicos', area: 'medicos' },
  '/consultas': { label: 'Consultas', area: 'medicos' },
  '/perguntas': { label: 'Perguntas ao médico', area: 'medicos' },
  '/encontrar': { label: 'Encontrar especialistas', area: 'medicos' },
  '/teleconsulta/:id': { label: 'Teleconsulta', area: 'medicos' },

  '/perfil': { label: 'Perfil', area: 'conta' },
  '/patients': { label: 'Dependentes', area: 'conta' },
  '/familia': { label: 'Família', area: 'conta' },
  '/planos': { label: 'Planos e créditos', area: 'conta' },
  '/carteira': { label: 'Carteira de créditos', area: 'conta' },
  '/indique': { label: 'Indique e ganhe', area: 'conta' },
  '/conquistas': { label: 'Conquistas', area: 'conta' },
  '/seguranca': { label: 'Segurança', area: 'conta' },
  '/suporte': { label: 'Suporte', area: 'conta' },
  '/faq': { label: 'Perguntas frequentes', area: 'conta' },
  '/features': { label: 'O que o app faz', area: 'conta' },
  '/como-funciona': { label: 'Como funciona', area: 'conta' },

  '/admin': { label: 'Painel admin', area: 'admin' },
};

/** Telas do paciente que entram na lista "ninguém abriu" (admin e rotas com id ficam fora). */
export const PATIENT_SCREENS: string[] = Object.entries(SCREENS)
  .filter(([path, s]) => s.area !== 'admin' && !path.includes(':id'))
  .map(([path]) => path);

export function screenLabel(path: string): string {
  if (SCREENS[path]) return SCREENS[path].label;
  // "/medicoes/historico/peso" → usa o rótulo do pai quando existir
  const parent = Object.keys(SCREENS).filter((k) => k !== '/' && path.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0];
  return parent ? `${SCREENS[parent].label} › ${path.slice(parent.length + 1)}` : path;
}

export function screenArea(path: string): ScreenArea {
  if (SCREENS[path]) return SCREENS[path].area;
  const parent = Object.keys(SCREENS).filter((k) => k !== '/' && path.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0];
  return parent ? SCREENS[parent].area : 'outros';
}

export interface ScreenRow { screen: string; users: number; users7: number; views: number; lastDay: string; android: number; web: number }

/** Telas do paciente sem nenhuma abertura no período (candidatas a esconder/repensar). */
export function neverOpened(rows: ScreenRow[]): string[] {
  const seen = new Set(rows.map((r) => r.screen));
  return PATIENT_SCREENS.filter((p) => !seen.has(p) && ![...seen].some((s) => s.startsWith(p === '/' ? '//' : p + '/')));
}

/** Soma pessoas/aberturas por área — pessoas é o MÁXIMO da área (não dá para somar pessoas distintas). */
export function byArea(rows: ScreenRow[]): { area: ScreenArea; label: string; views: number; topUsers: number; screens: number }[] {
  const acc = new Map<ScreenArea, { views: number; topUsers: number; screens: number }>();
  for (const r of rows) {
    const a = screenArea(r.screen);
    const cur = acc.get(a) ?? { views: 0, topUsers: 0, screens: 0 };
    acc.set(a, { views: cur.views + r.views, topUsers: Math.max(cur.topUsers, r.users), screens: cur.screens + 1 });
  }
  return [...acc.entries()].map(([area, v]) => ({ area, label: AREA_LABEL[area], ...v })).sort((x, y) => y.views - x.views);
}
