import { useState } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
  FrameFooter,
} from '@/components/reui/frame';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineIndicator,
  TimelineHeader,
  TimelineTitle,
  TimelineDate,
  TimelineContent,
} from '@/components/reui/timeline';
import {
  Empty as ReuiEmpty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { IconTile } from '@/components/reui/patterns';
import { ReuiTextarea } from '@/components/reui/form-controls';

/** Modelos rápidos clínicos para o médico preencher com 1 clique. */
const getTemplates = (patient?: any) => [
  {
    icon: '⚖️',
    label: 'Peso / Sinais',
    text: `Peso: ${patient?.weight ? `${patient.weight} kg` : '___ kg'} · PA: ___x___ mmHg · FC: ___ bpm`,
  },
  {
    icon: '🩺',
    label: 'Conduta',
    text: 'Conduta: Paciente orientado sobre o quadro clínico. Manter medicações habituais e estilo de vida saudável.',
  },
  {
    icon: '💊',
    label: 'Ajuste de Remédio',
    text: 'Ajuste medicamentoso: Ajustada dosagem de [Medicamento]. Orientado posologia e horários.',
  },
  {
    icon: '📅',
    label: 'Retorno 60d',
    text: 'Retorno solicitado em 60 dias com novos exames laboratoriais de acompanhamento.',
  },
  {
    icon: '🥗',
    label: 'Estilo de Vida',
    text: 'Orientações: Reforçado hábito de hidratação, controle de sal/açúcar e prática regular de atividade física.',
  },
  {
    icon: '⚠️',
    label: 'Sinais de Alerta',
    text: 'Sinais de alerta explicados. Se dor aguda, falta de ar ou PA > 140x90, buscar pronto atendimento.',
  },
];

/** Empty state compacto das views do portal (mantido exportado para compatibilidade). */
export const Empty = ({ label, icon = '📭' }: { label: string; icon?: string }) => (
  <Card
    sx={{
      borderRadius: '20px',
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}
  >
    <CardContent>
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Box sx={{ fontSize: 44, mb: 1 }}>{icon}</Box>
        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

/** #1 Anotações clínicas (histórico de atendimento) — ReUI Frame + Timeline c-timeline-4. */
export const NotesTab = ({
  notes,
  newNote,
  setNewNote,
  onAdd,
  onDelete,
  onSave,
  patient,
}: {
  notes: any[];
  newNote: string;
  setNewNote: (s: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSave: (id: string, content: string) => void;
  patient?: any;
}) => {
  const themeClass = useReuiThemeSync();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const templates = getTemplates(patient);

  const applyTemplate = (tplText: string) => {
    if (!newNote.trim()) {
      setNewNote(tplText);
    } else {
      setNewNote(`${newNote.trim()}\n\n${tplText}`);
    }
  };

  return (
    <div className={`reui-scope ${themeClass} space-y-4`}>
      {/* Editor de Evolução Clínica em ReUI Frame */}
      <Frame>
        <FrameHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconTile tone="primary" size="sm">
              <NoteAltOutlinedIcon sx={{ fontSize: 18 }} />
            </IconTile>
            <div>
              <FrameTitle>Nova evolução / anotação clínica</FrameTitle>
              <FrameDescription>
                Registre condutas, sinais vitais e orientações no prontuário do paciente
              </FrameDescription>
            </div>
          </div>
          <ReuiBadge variant="primary-light" size="xs">
            Prontuário rápido
          </ReuiBadge>
        </FrameHeader>

        <FramePanel className="space-y-3">
          {/* Modelos rápidos pré-formatados com 1 clique */}
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              ⚡ Modelos rápidos (toque para inserir)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => applyTemplate(tpl.text)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/15 cursor-pointer"
                >
                  <span>{tpl.icon}</span>
                  <span>{tpl.label}</span>
                </button>
              ))}
            </div>
          </div>

          <ReuiTextarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            placeholder="Conduta, observação clínica, sinais vitais, retorno solicitado…"
          />
        </FramePanel>

        <FrameFooter className="flex items-center justify-between gap-2">
          <div>
            {newNote.trim() && (
              <button
                type="button"
                onClick={() => setNewNote('')}
                className="rounded-full px-3 py-1 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
              >
                Limpar texto
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={!newNote.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <AddRoundedIcon sx={{ fontSize: 16 }} />
            Adicionar anotação
          </button>
        </FrameFooter>
      </Frame>

      {/* Linha do Tempo Clínica (ReUI Timeline c-timeline-4) */}
      {notes.length === 0 ? (
        <Frame>
          <FramePanel className="p-6">
            <ReuiEmpty className="border-0 p-4 md:p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <NoteAltOutlinedIcon sx={{ fontSize: 22 }} />
                </EmptyMedia>
                <EmptyTitle>Nenhuma evolução registrada</EmptyTitle>
                <EmptyDescription>
                  Use o campo acima ou os modelos rápidos para registrar a primeira evolução clínica deste paciente.
                </EmptyDescription>
              </EmptyHeader>
            </ReuiEmpty>
          </FramePanel>
        </Frame>
      ) : (
        <Frame>
          <FrameHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <FrameTitle>Linha do tempo de evoluções</FrameTitle>
              <FrameDescription>
                Histórico cronológico de atendimentos e condutas registradas
              </FrameDescription>
            </div>
            <ReuiBadge variant="outline" size="xs">
              {notes.length} {notes.length === 1 ? 'registro' : 'registros'}
            </ReuiBadge>
          </FrameHeader>

          <FramePanel>
            <Timeline defaultValue={notes.length}>
              {notes.map((n, idx) => {
                const step = idx + 1;
                const formattedDate = new Date(n.createdAt).toLocaleString(
                  'pt-BR',
                  {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }
                );

                return (
                  <TimelineItem key={n.id} step={step}>
                    <TimelineSeparator />
                    <TimelineIndicator className="bg-primary/15 text-primary border-primary/40">
                      <CheckRoundedIcon sx={{ fontSize: 12 }} />
                    </TimelineIndicator>

                    <TimelineHeader className="flex items-center justify-between gap-2">
                      <div>
                        <TimelineDate className="mb-0 tabular-nums">
                          {formattedDate}
                        </TimelineDate>
                        <TimelineTitle>Evolução clínica #{notes.length - idx}</TimelineTitle>
                      </div>
                      {editingId !== n.id && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Editar anotação"
                            onClick={() => {
                              setEditingId(n.id);
                              setEditText(n.content);
                            }}
                            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
                          >
                            <EditOutlinedIcon sx={{ fontSize: 16 }} />
                          </button>
                          <button
                            type="button"
                            aria-label="Excluir anotação"
                            onClick={() => onDelete(n.id)}
                            className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                          >
                            <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
                          </button>
                        </div>
                      )}
                    </TimelineHeader>

                    <TimelineContent className="mt-2">
                      {editingId === n.id ? (
                        <div className="space-y-2.5 rounded-xl border border-primary/30 bg-muted/20 p-3">
                          <ReuiTextarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!editText.trim()}
                              onClick={() => {
                                onSave(n.id, editText.trim());
                                setEditingId(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
                            >
                              Salvar alterações
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-full px-3 py-1 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-border bg-muted/25 p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {n.content}
                        </div>
                      )}
                    </TimelineContent>
                  </TimelineItem>
                );
              })}
            </Timeline>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
};
