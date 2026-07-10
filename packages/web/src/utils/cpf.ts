export function normalizeCpf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function formatCpf(value: unknown): string {
  const cpf = normalizeCpf(value).slice(0, 11);
  const p1 = cpf.slice(0, 3);
  const p2 = cpf.slice(3, 6);
  const p3 = cpf.slice(6, 9);
  const p4 = cpf.slice(9, 11);
  if (cpf.length <= 3) return p1;
  if (cpf.length <= 6) return `${p1}.${p2}`;
  if (cpf.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

export function isValidCpf(value: unknown): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (baseLength: number) => {
    let sum = 0;
    for (let i = 0; i < baseLength; i++) sum += Number(cpf[i]) * (baseLength + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}
