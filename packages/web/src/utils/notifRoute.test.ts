// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { notifRoute } from './notifRoute';

describe('destino do toque na notificação', () => {
  it('push que sugere alimentação abre a tela de alimentação no paciente do aviso', () => {
    expect(notifRoute({ type: 'alert', data: { screen: 'alimentacao', patientId: 'p1', examId: 'e1' } })).toBe('/alimentacao?paciente=p1');
    expect(notifRoute({ type: 'tip', data: { screen: 'alimentacao' } })).toBe('/alimentacao');
  });
  it('alerta sem sugestão de alimentação continua abrindo o exame', () => {
    expect(notifRoute({ type: 'alert', data: { examId: 'e1', patientId: 'p1' } })).toBe('/exams/e1/show');
  });
  it('chamada de teleconsulta continua com prioridade', () => {
    expect(notifRoute({ data: { type: 'teleconsulta', reminderId: 'r1', screen: 'alimentacao' } })).toBe('/teleconsulta/r1');
  });
});
