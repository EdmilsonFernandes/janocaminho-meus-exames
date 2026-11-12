import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { cn } from 'cn';
import '../../doctor-v2/tw.css';

/**
 * Estado vazio padrão de listas/tabelas (admin, portal médico, paciente).
 * Um só componente no lugar dos ~40 "Nenhum X." soltos em Typography cinza:
 * título diz O QUE está vazio; `description` diz o próximo passo (só quando existe um);
 * `action` é o botão que resolve. Sem ação possível → só título, sem texto de enchimento.
 */
export function ListEmpty({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className="dx-island w-full">
      <Empty className={cn('border-0 px-4 py-8', className)}>
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon ?? <Inbox aria-hidden="true" />}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          {description ? <EmptyDescription>{description}</EmptyDescription> : null}
        </EmptyHeader>
        {action ? <EmptyContent>{action}</EmptyContent> : null}
      </Empty>
    </div>
  );
}
