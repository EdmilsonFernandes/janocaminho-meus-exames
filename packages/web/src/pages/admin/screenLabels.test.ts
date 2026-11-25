import { describe, it, expect } from 'vitest';
import { byArea, neverOpened, screenArea, screenLabel, PATIENT_SCREENS, type ScreenRow } from './screenLabels';

const row = (screen: string, users: number, views: number): ScreenRow => ({ screen, users, users7: users, views, lastDay: '2026-11-25', android: users, web: 0 });

describe('rótulos das telas medidas', () => {
  it('nomeia tela conhecida, subrota e tela desconhecida', () => {
    expect(screenLabel('/tendencias')).toBe('Tendências');
    expect(screenLabel('/exams/:id/show')).toBe('Exame aberto');
    expect(screenLabel('/medicoes/historico/peso')).toBe('Medições › historico/peso');
    expect(screenLabel('/tela-nova')).toBe('/tela-nova');
    expect(screenArea('/medicoes/historico/peso')).toBe('rotina');
    expect(screenArea('/tela-nova')).toBe('outros');
  });

  it('lista de "ninguém abriu" ignora admin, rotas com id e telas cuja subrota foi aberta', () => {
    expect(PATIENT_SCREENS).not.toContain('/admin');
    expect(PATIENT_SCREENS).not.toContain('/exams/:id/show');
    const unused = neverOpened([row('/', 5, 20), row('/medicoes/historico/peso', 1, 1), row('/chat', 2, 3)]);
    expect(unused).not.toContain('/');
    expect(unused).not.toContain('/chat');
    expect(unused).not.toContain('/medicoes'); // abriu uma subrota de Medições
    expect(unused).toContain('/radar-hormonal');
    expect(unused).toContain('/vacinas');
  });

  it('agrupa por área: soma aberturas e guarda o maior número de pessoas', () => {
    const areas = byArea([row('/tendencias', 4, 10), row('/evolucao', 2, 3), row('/chat', 3, 9)]);
    expect(areas[0]).toMatchObject({ area: 'exames', views: 13, topUsers: 4, screens: 2 });
    expect(areas[1]).toMatchObject({ area: 'ia', views: 9, topUsers: 3, screens: 1 });
  });
});
