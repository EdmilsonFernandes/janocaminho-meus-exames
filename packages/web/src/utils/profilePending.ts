/**
 * O que falta para o perfil chegar a 100%. A regra é do servidor (GET /patients/:id →
 * profileCompleteness.missing): sexo, data de nascimento, altura, peso e CPF, 20% cada.
 * Aqui só vive o texto e o destino de cada pendência, para a home e o Perfil dizerem a MESMA coisa.
 */
export interface PendingItem { key: string; label: string; why: string; to: string }

const ITEMS: Record<string, Omit<PendingItem, 'key'>> = {
  cpf: { label: 'CPF', why: 'confirma que o exame enviado é seu', to: '/perfil?falta=cpf' },
  dateOfBirth: { label: 'Data de nascimento', why: 'ajusta as faixas de referência à sua idade', to: '/perfil?falta=dateOfBirth' },
  gender: { label: 'Sexo biológico', why: 'define as faixas de referência dos exames', to: '/perfil?falta=gender' },
  heightCm: { label: 'Altura', why: 'usada com o peso para calcular o IMC', to: '/perfil?falta=heightCm' },
  weight: { label: 'Peso', why: 'registrado nas suas medições', to: '/medicoes' },
};

/** Pendências na ordem em que o servidor devolve; chave desconhecida é ignorada (app antigo x servidor novo). */
export function pendingItems(missing: string[] | null | undefined): PendingItem[] {
  return (missing ?? []).filter((k) => ITEMS[k]).map((k) => ({ key: k, ...ITEMS[k] }));
}

/** id do bloco do campo na tela de Perfil (para rolar até ele). */
export const profileFieldId = (key: string): string => `perfil-campo-${key}`;
