import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Button as MuiButton, Chip as MuiChip, Divider as MuiDivider } from '@mui/material';
import { Badge } from '@/components/reui/badge';
import './tw.css';

/**
 * SPIKE da ilha doctor-v2 (29/10/26) — NÃO é o portal ainda.
 *
 * Prova, numa única página atrás de flag:
 *  1. Componente ReUI (Tailwind, Base UI) renderiza com os tokens de marca;
 *  2. Componentes MUI da mesma página continuam 100% intactos (sem preflight);
 *  3. Dark mode da ilha (classe .dark) sem afetar o tema MUI;
 *  4. Utilities Tailwind geradas SÓ a partir desta ilha (escopo fechado).
 *
 * Flag: localStorage['dx.doctorV2'] = '1'. Sem flag → redireciona ao portal atual.
 * Quando o portal v2 crescer, esta página morre e vira o shell real.
 */
const FLAG = 'dx.doctorV2';

export default function DoctorV2Spike() {
  const [sp] = useSearchParams();
  const [enabled] = useState(() => {
    // Acesso por link: /#/doctor-v2?on=1 (persiste a flag p/ visitas seguintes).
    if (sp.get('on') === '1') { try { localStorage.setItem(FLAG, '1'); } catch { /* */ } return true; }
    try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
  });
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  if (!enabled) return <Navigate to="/doctor" replace />;

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDark(document.documentElement.classList.contains('dark'));
  };

  return (
    <div className="dx-island min-h-screen bg-background text-foreground p-6 sm:p-10 flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">Portal Médico v2 — spike</h2>
          <p className="text-sm text-muted-foreground">
            Ilha Tailwind/ReUI × app MUI. Esta rota não aparece na navegação; acessa com a flag <code>dx.doctorV2</code>.
          </p>
        </div>
        <MuiButton size="small" variant="outlined" onClick={toggleDark}>
          {dark ? '☀️ ilha clara' : '🌙 ilha escura'}
        </MuiButton>
      </header>

      {/* 1. ReUI Badge — o componente real do registry, com variantes do dia-a-dia clínico */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ReUI Badge (registry, tokens de marca)</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Teal marca</Badge>
          <Badge variant="secondary">Cobre</Badge>
          <Badge variant="success-light">Dentro da faixa</Badge>
          <Badge variant="warning-light">Atenção</Badge>
          <Badge variant="destructive-light">Alerta</Badge>
          <Badge variant="info-light">Teleconsulta</Badge>
          <Badge variant="destructive">Crítico</Badge>
          <Badge variant="success" radius="full">Concluída</Badge>
          <Badge variant="outline" size="sm">Rascunho</Badge>
        </div>
      </section>

      <MuiDivider />

      {/* 2. MUI intocado — mesmo gradiente teal do theme.ts, prova que o reset não vazou */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">MUI do app (tema global intocado)</p>
        <div className="flex flex-wrap items-center gap-2">
          <MuiButton variant="contained">Botão MUI (gradiente teal)</MuiButton>
          <MuiButton variant="outlined" color="secondary">Cobre</MuiButton>
          <MuiChip color="primary" label="Chip MUI" />
          <MuiChip variant="outlined" color="success" label="Score ok" />
        </div>
      </section>

      <MuiDivider />

      {/* 3. Utilities da ilha — card tailwind puro com a marca */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Utility Tailwind (ilha)</p>
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm" style={{ maxWidth: 420 }}>
          <p className="font-semibold text-primary dark:text-primary">Fila de alertas (exemplo de composição)</p>
          <p className="text-muted-foreground mt-1">
            3 pacientes com valores alterados · 1 teleconsulta hoje · último exame há 2 dias
          </p>
        </div>
      </section>

      <footer className="mt-auto text-xs text-muted-foreground">
        Spike técnico — validar coexistência antes do rebuild do portal. Nenhum dado real aqui.
      </footer>
    </div>
  );
}
