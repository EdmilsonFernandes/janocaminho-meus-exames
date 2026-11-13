/**
 * Peças do HEADER do app (paciente) — padrão do bloco ReUI navbar-4: marca à esquerda,
 * métrica no centro, ações "ghost" à direita. Sem bordas competindo, sem sombras.
 *
 * Vive em components/reui/ porque só as pastas listadas em `doctor-v2/tw.css` (@source)
 * geram classes Tailwind — o App.tsx e os componentes soltos NÃO geram.
 * A lógica (saldo, não lidas, pacientes) continua nos componentes donos; aqui é só a pele.
 *
 * Alvo de toque: 40px (size-10) em vez dos 28–36px do ReUI — é um header de celular.
 */
import * as React from 'react';
import { Bell, ChevronDown, Zap } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/reui/badge';
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import '../../doctor-v2/tw.css';

const ISLAND = 'dx-island [&_button]:font-[inherit]';

/** Botão de ícone do header (menu, voltar): ghost, redondo, traço fino. */
export function HeaderIconButton({ label, children, className, ...props }: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <span className={ISLAND}>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label={label}
        title={label}
        className={cn('size-10 rounded-full border-0 bg-transparent text-muted-foreground transition-colors duration-200 hover:text-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]', className)}
        {...props}
      >
        {children}
      </Button>
    </span>
  );
}

/** Nome da marca ao lado do ícone. */
export function HeaderWordmark({ children }: { children: React.ReactNode }) {
  return <span className={cn(ISLAND, 'text-[15px] font-semibold tracking-tight whitespace-nowrap text-foreground')}>{children}</span>;
}

/**
 * Selo de leituras: pílula suave SEM borda (Badge light do ReUI), raio âmbar pequeno.
 * `alert` = saldo insuficiente (treme em vermelho, comportamento que já existia).
 */
export function ReadsPill({
  children, icon = true, alert = false, className, ...props
}: { icon?: boolean; alert?: boolean } & Omit<React.ComponentProps<'button'>, 'type'>) {
  return (
    <span className={cn(ISLAND, 'min-w-0')}>
      <button
        type="button"
        className={cn(
          'group flex min-h-10 max-w-full cursor-pointer items-center border-0 bg-transparent p-0 outline-none',
          alert && 'animate-[dx-pill-shake_.45s_ease-in-out_3]',
          className,
        )}
        {...props}
      >
        <Badge
          variant={alert ? 'destructive-light' : 'primary-light'}
          radius="full"
          size="xl"
          className="h-8 max-w-full gap-1.5 border-0 px-3 text-[13px] font-medium tabular-nums transition-colors duration-200 group-hover:bg-primary/15 group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50"
        >
          {icon ? <Zap aria-hidden="true" className="size-3.5 shrink-0 fill-amber-400 text-amber-500" /> : null}
          <span className="min-w-0 truncate">{children}</span>
        </Badge>
      </button>
    </span>
  );
}

/** Sino: ghost + ponto vermelho com anel da cor do fundo (não cola no ícone). */
export function BellButton({ unread, ringing = false, className, ...props }: { unread: number; ringing?: boolean } & React.ComponentProps<typeof Button>) {
  const label = unread > 0 ? `Notificações: ${unread} ${unread === 1 ? 'nova' : 'novas'}` : 'Notificações';
  return (
    <span className={ISLAND}>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label={label}
        title={label}
        className={cn('relative size-10 rounded-full border-0 bg-transparent text-muted-foreground transition-colors duration-200 hover:text-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]', className)}
        {...props}
      >
        <Bell aria-hidden="true" className={cn('origin-top', ringing && 'animate-[dx-bell-ring_1.1s_ease-in-out_3] motion-reduce:animate-none')} />
        {unread > 0 ? <span aria-hidden="true" className="absolute top-2 right-2 size-2.5 rounded-full bg-red-500 ring-2 ring-background" /> : null}
      </Button>
    </span>
  );
}

/**
 * Gatilho do menu da conta: foto redonda + ponto de status + chevron discreto.
 * O ponto é VERDADEIRO: verde com internet, cinza offline (o app funciona offline).
 */
export function UserTrigger({
  name, detail, photo, online, className, ...props
}: { name?: string | null; detail?: string | null; photo?: string; online: boolean } & Omit<React.ComponentProps<'button'>, 'type'>) {
  const initial = name?.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={ISLAND}>
      <button
        type="button"
        aria-label={`Conta de ${name ?? 'paciente'} — ${online ? 'online' : 'sem internet'}. Abrir menu.`}
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent py-0 ps-0 pe-1 text-foreground outline-none transition-colors duration-200 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:pe-2',
          className,
        )}
        {...props}
      >
        <Avatar size="lg" className="after:hidden">
          {photo ? <AvatarImage src={photo} alt="" /> : null}
          <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initial}</AvatarFallback>
          <AvatarBadge className={online ? 'bg-emerald-500' : 'bg-muted-foreground'} />
        </Avatar>
        <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
          <span className="max-w-32 truncate text-[13px] font-semibold">{name ?? 'Selecionar'}</span>
          {detail ? <span className="max-w-32 truncate text-xs text-muted-foreground">{detail}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </span>
  );
}

/** Estado de rede do navegador, reativo (alimenta o ponto de status do avatar). */
export function useOnline(): boolean {
  const [online, setOnline] = React.useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
