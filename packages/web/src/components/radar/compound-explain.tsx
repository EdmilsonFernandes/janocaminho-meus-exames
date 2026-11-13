/**
 * Cartão "o que é este composto" (botão "?") — mesmo conceito do "?" dos exames: a explicação
 * leiga vem do banco de conhecimento (a IA só gera na 1ª vez; depois é leitura).
 *
 * Ordem das seções = a ordem em que um leigo preocupado quer ler. A seção "Quando procurar
 * atendimento" é TEXTO FIXO, igual para todos os compostos — não é gerada por IA.
 */
import { useEffect, useState } from 'react';
import { Activity, CircleHelp, HeartPulse, MessagesSquare, RotateCw, ShieldAlert, Siren, Sparkles, TestTubeDiagonal, TriangleAlert } from 'lucide-react';
import { API_URL, token } from '../../config';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { compoundById } from '@/utils/hormoneRadar';
import { CompoundIcon } from './compound-picker';

type SectionKey = 'oQueE' | 'noCorpo' | 'porQueUsam' | 'nosExames' | 'riscos' | 'levarAoMedico';
type Sections = Record<SectionKey, string>;

const SECTIONS: { key: SectionKey; title: string; icon: typeof Activity }[] = [
  { key: 'oQueE', title: 'O que é', icon: CircleHelp },
  { key: 'noCorpo', title: 'O que faz no seu corpo', icon: HeartPulse },
  { key: 'porQueUsam', title: 'Por que alguém usa', icon: Sparkles },
  { key: 'nosExames', title: 'O que costuma mudar nos seus exames', icon: TestTubeDiagonal },
  { key: 'riscos', title: 'Riscos que as pessoas mais subestimam', icon: ShieldAlert },
];

// Uma leitura por sessão: reabrir o mesmo composto não consulta o servidor de novo.
const memory = new Map<string, Sections>();

export function CompoundExplainDialog({ compoundId, onClose }: { compoundId: string | null; onClose: () => void }) {
  const [sections, setSections] = useState<Sections | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!compoundId) return;
    const cached = memory.get(compoundId);
    setSections(cached ?? null);
    setFailed(false);
    if (cached) return;
    let cancelled = false;
    fetch(`${API_URL}/items/compound-explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ id: compoundId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!cancelled && json?.sections) { memory.set(compoundId, json.sections); setSections(json.sections); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [compoundId, attempt]);

  const comp = compoundId ? compoundById(compoundId) : null;
  const questions = sections?.levarAoMedico ? sections.levarAoMedico.split('|').map((q) => q.trim()).filter(Boolean) : [];

  return (
    <Dialog open={!!compoundId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 pe-8">
            {comp ? <CompoundIcon comp={comp} className="size-10" /> : null}
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="leading-snug">{comp?.name ?? ''}</DialogTitle>
              <DialogDescription>Explicação educativa, em linguagem simples.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {failed ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Não consegui carregar esta explicação</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="lg" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>
                <RotateCw aria-hidden="true" />
                Tentar de novo
              </Button>
            </AlertDescription>
          </Alert>
        ) : !sections ? (
          <div role="status" aria-label="Preparando a explicação" className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
            <p className="m-0 text-xs text-muted-foreground">Preparando a explicação. Se for a primeira consulta deste composto, pode levar até 2 minutos.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {SECTIONS.map(({ key, title, icon: Icon }) => (
              <section key={key} className="flex flex-col gap-1.5">
                <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  {title}
                </h3>
                <p className="m-0 text-sm leading-relaxed text-foreground">{sections[key]}</p>
              </section>
            ))}

            <Alert variant="warning">
              <Siren aria-hidden="true" />
              <AlertTitle>Quando procurar atendimento</AlertTitle>
              <AlertDescription>
                <p className="m-0"><strong>Agora (SAMU 192):</strong> dor no peito, falta de ar, fraqueza ou fala enrolada de repente, perna inchada e dolorida, pele ou olhos amarelados. Pensamentos de se machucar: CVV 188.</p>
                <p className="m-0 mt-1.5"><strong>Marque uma consulta:</strong> pressão alta, mudança de humor ou de sono, queda de libido, ou se você pretende ter filhos.</p>
              </AlertDescription>
            </Alert>

            {questions.length ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
                  <MessagesSquare aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  O que levar para o seu médico
                </h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {questions.map((q) => (
                    <li key={q} className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed">{q}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="m-0 border-t border-border pt-3 text-xs text-muted-foreground">
              Conteúdo educativo gerado com apoio de IA e igual para todos: não considera o seu caso, não indica dose e não substitui consulta. Exames normais não descartam dano. Qualquer mudança no uso, inclusive parar, deve ser conversada com o médico.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
