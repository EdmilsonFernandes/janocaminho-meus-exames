// Medidor de telas (25/11/26): o app manda as telas abertas em lote e o admin vê a adoção.
// Cobre: soma por conta+tela+dia, recusa de lixo/ids crus, isolamento por login,
// e o painel do admin (só contas reais; conta de teste e admin ficam de fora).
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { createUser, api, authHeader, resetDb } from './helpers';
import { cleanScreen } from '../src/routes/usage.routes';

describe('medidor de telas', () => {
  beforeEach(async () => { await resetDb(); });

  it('cleanScreen aceita rota normalizada e recusa id cru, URL e texto livre', () => {
    expect(cleanScreen('/tendencias')).toBe('/tendencias');
    expect(cleanScreen('/Exams/:id/show')).toBe('/exams/:id/show');
    expect(cleanScreen('/')).toBe('/');
    expect(cleanScreen('/exams/cmvqws02w00oknu1fezuvet4e/show')).toBeNull(); // cuid escapou
    expect(cleanScreen('/medicoes/historico/12345')).toBeNull();
    expect(cleanScreen('https://exemplo.com/x')).toBeNull();
    expect(cleanScreen('/chat?pergunta=minha glicose')).toBeNull();
    expect(cleanScreen('x'.repeat(200))).toBeNull();
    expect(cleanScreen(42)).toBeNull();
  });

  it('exige login', async () => {
    const r = await api().post('/api/usage/screens').send({ views: [{ screen: '/chat', n: 1 }] });
    expect(r.status).toBe(401);
  });

  it('soma aberturas da mesma tela no mesmo dia e ignora itens inválidos', async () => {
    const u = await createUser();
    const r1 = await api().post('/api/usage/screens').set(authHeader(u.token))
      .send({ platform: 'android', views: [{ screen: '/tendencias', n: 2 }, { screen: '/chat', n: 1 }, { screen: 'lixo sem barra', n: 9 }, { screen: '/exams/cmvqws02w00oknu1fezuvet4e', n: 1 }] });
    expect(r1.status).toBe(200);
    expect(r1.body.saved).toBe(2);
    await api().post('/api/usage/screens').set(authHeader(u.token)).send({ views: [{ screen: '/tendencias', n: 3 }] });

    const rows = await prisma.screenView.findMany({ where: { userId: u.user.id }, orderBy: { screen: 'asc' } });
    expect(rows.map((x) => [x.screen, x.views])).toEqual([['/chat', 1], ['/tendencias', 5]]);
    expect(rows[1].platform).toBe('android'); // lote sem plataforma não apaga a que já havia
  });

  it('limita o tamanho do lote e o total por item (não vira contador infinito)', async () => {
    const u = await createUser();
    const views = Array.from({ length: 80 }, (_, i) => ({ screen: `/tela-${i}`, n: 99999 }));
    const r = await api().post('/api/usage/screens').set(authHeader(u.token)).send({ views });
    expect(r.body.saved).toBe(40);
    const max = await prisma.screenView.aggregate({ where: { userId: u.user.id }, _max: { views: true } });
    expect(max._max.views).toBe(200);
  });

  it('painel do admin: conta só contas reais, ordena por pessoas e devolve a série contínua', async () => {
    const a = await createUser();
    const b = await createUser();
    const teste = await createUser();
    await prisma.user.update({ where: { id: teste.user.id }, data: { isTest: true } });
    const admin = await createUser();
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });

    const send = (t: string, views: { screen: string; n: number }[]) =>
      api().post('/api/usage/screens').set(authHeader(t)).send({ platform: 'web', views });
    await send(a.token, [{ screen: '/tendencias', n: 4 }, { screen: '/radar-hormonal', n: 1 }]);
    await send(b.token, [{ screen: '/tendencias', n: 1 }]);
    await send(teste.token, [{ screen: '/tendencias', n: 50 }, { screen: '/so-teste', n: 1 }]);
    await send(admin.token, [{ screen: '/admin', n: 7 }]);

    const negado = await api().get('/api/admin/screen-usage').set(authHeader(a.token));
    expect(negado.status).toBe(403);

    const r = await api().get('/api/admin/screen-usage?days=7').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.days).toBe(7);
    expect(r.body.totals).toMatchObject({ users: 2, views: 6, screens: 2 });
    expect(r.body.screens.map((s: { screen: string }) => s.screen)).toEqual(['/tendencias', '/radar-hormonal']);
    expect(r.body.screens[0]).toMatchObject({ users: 2, users7: 2, views: 5, web: 2, android: 0 });
    expect(r.body.daily).toHaveLength(7);
    expect(r.body.daily[6]).toMatchObject({ users: 2, views: 6 }); // hoje é o último ponto
    expect(r.body.daily[0]).toMatchObject({ users: 0, views: 0 }); // dia sem uso vem como zero
    expect(r.body.trackingSince).toBe(r.body.daily[6].day);
  });

  it('painel vazio (ninguém abriu nada) responde 200 com zeros', async () => {
    const admin = await createUser();
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
    const r = await api().get('/api/admin/screen-usage').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.totals).toEqual({ users: 0, views: 0, screens: 0 });
    expect(r.body.daily).toHaveLength(30);
    expect(r.body.trackingSince).toBeNull();
  });
});
