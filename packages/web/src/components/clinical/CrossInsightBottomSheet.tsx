import React, { useState } from 'react';
import { Drawer } from '@mui/material';
import { Badge as ReuiBadge } from '@/components/reui/badge';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DirectionsRunRoundedIcon from '@mui/icons-material/DirectionsRunRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import LocalHospitalRoundedIcon from '@mui/icons-material/LocalHospitalRounded';
import { useReuiThemeSync } from '@/components/reui/useReuiThemeSync';

export interface MetricChipData {
  key: string;
  value: string;
  status: 'high' | 'normal' | 'low';
  label: 'Elevado' | 'Normal' | 'Baixo';
}

export interface CrossInsightData {
  has_cross_insight: boolean;
  insight_id: string;
  category: 'sports' | 'cardio' | 'metabolic' | 'hepatic';
  severity: 'critical' | 'warning' | 'info' | 'success';
  badge_text: string;
  title: string;
  metrics: MetricChipData[];
  clinical_summary: string;
  doctor_question: string;
  push_notification?: {
    title: string;
    body: string;
  };
  primary_action?: string;
  secondary_action?: string;
  signature?: string;
}

interface CrossInsightBottomSheetProps {
  open: boolean;
  insight: CrossInsightData | null;
  onClose: () => void;
  onAddQuestion?: (question: string) => void;
}

const STORAGE_PREFIX = 'dx_cross_insight_dismissed_';

/** Rótulo de status p/ payloads sem `label` (status nunca só pela cor — IEC 62366). */
const STATUS_LABEL: Record<MetricChipData['status'], MetricChipData['label']> = { high: 'Elevado', normal: 'Normal', low: 'Baixo' };

/** Verifica se um insight já foi dispensado anteriormente pelo usuário (anti-spam). */
export function isCrossInsightDismissed(signatureOrId?: string): boolean {
  if (!signatureOrId) return false;
  try {
    return !!localStorage.getItem(`${STORAGE_PREFIX}${signatureOrId}`);
  } catch {
    return false;
  }
}

/** Grava que o usuário já leu/dispensou o insight com este conjunto de valores. */
export function markCrossInsightDismissed(signatureOrId?: string): void {
  if (!signatureOrId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${signatureOrId}`, new Date().toISOString());
  } catch {
    /* noop */
  }
}

export const CrossInsightBottomSheet: React.FC<CrossInsightBottomSheetProps> = ({
  open,
  insight,
  onClose,
  onAddQuestion,
}) => {
  const themeClass = useReuiThemeSync();
  const [copied, setCopied] = useState(false);
  // A11y: título com id estável → Drawer paper aria-labelledby (nome acessível do
  // diálogo além do role padrão do MUI). useId evita colisão se houver 2 na árvore.
  const titleId = React.useId();
  const descId = React.useId();

  if (!insight || !insight.has_cross_insight) return null;

  const handleDismiss = () => {
    markCrossInsightDismissed(insight.signature || insight.insight_id);
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(insight.doctor_question);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (onAddQuestion) {
        onAddQuestion(insight.doctor_question);
      }
    } catch {
      /* fallback */
    }
  };

  const categoryIcon = () => {
    switch (insight.category) {
      case 'sports':
        return <DirectionsRunRoundedIcon sx={{ fontSize: 16 }} />;
      case 'cardio':
        return <FavoriteRoundedIcon sx={{ fontSize: 16 }} />;
      case 'hepatic':
        return <LocalHospitalRoundedIcon sx={{ fontSize: 16 }} />;
      default:
        return <MonitorHeartRoundedIcon sx={{ fontSize: 16 }} />;
    }
  };

  const badgeVariant = () => {
    switch (insight.severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'warning';
      case 'success':
        return 'success';
      default:
        return 'primary-light';
    }
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={handleDismiss}
      slotProps={{
        paper: {
          className: `reui-scope ${themeClass}`,
          // Auditoria tipografia/sheet 02/11: o Drawer do MUI não dá role ao papel —
          // sem isto o leitor de tela não anuncia "diálogo" nem o título. aria-modal
          // + labelledby/describedby fecham o contrato de dialog modal.
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': titleId,
          'aria-describedby': descId,
          'data-testid': 'cross-insight-sheet',
          sx: {
            borderTopLeftRadius: '28px',
            borderTopRightRadius: '28px',
            maxWidth: 480,
            width: '100%',
            mx: 'auto',
            maxHeight: '90dvh',
            overflowY: 'auto',
            bgcolor: 'background.paper',
            boxShadow: '0 -10px 40px -15px rgba(0,0,0,0.3)',
            p: 0,
          },
        },
      }}
    >
      {/* pb = max(24px, safe-area): no APK edge-to-edge a ação não fica sob a gesture bar. */}
      <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col min-w-0">
        {/* Drag handle pill */}
        <div className="w-10 h-1.5 rounded-full bg-muted-foreground/25 mx-auto mb-4" />

        {/* Badge da categoria */}
        <div className="mb-2">
          <ReuiBadge
            variant={badgeVariant()}
            size="sm"
            className="inline-flex items-center gap-1.5 px-3 py-1 font-bold rounded-full"
          >
            {categoryIcon()}
            {insight.badge_text}
          </ReuiBadge>
        </div>

        {/* Título Principal */}
        <h2 id={titleId} className="text-xl sm:text-2xl font-black text-foreground tracking-tight mb-3 font-heading leading-tight break-words [overflow-wrap:anywhere]">
          {insight.title}
        </h2>

        {/* Métricas Chips */}
        {insight.metrics && insight.metrics.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {insight.metrics.map((m, idx) => (
              <div
                key={idx}
                data-testid="metric-chip"
                // max-w-full + min-w-0: chip nunca força a largura do sheet; texto longo quebra
                // dentro do chip (rounded-2xl em vez de pill quando vira 2 linhas).
                className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-2xl border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold shadow-xs"
              >
                <span className="min-w-0 text-foreground break-words [overflow-wrap:anywhere]">
                  <strong className="font-bold">{m.key}:</strong> {m.value}
                </span>
                <ReuiBadge
                  size="xs"
                  data-testid="metric-status"
                  variant={
                    m.status === 'high'
                      ? 'destructive'
                      : m.status === 'normal'
                        ? 'success'
                        : 'outline'
                  }
                  className="shrink-0 px-1.5 py-0.5 text-[0.625rem] font-bold"
                >
                  {/* status legível além da cor — fallback quando o payload vem sem label */}
                  {m.label || STATUS_LABEL[m.status] || m.status}
                </ReuiBadge>
              </div>
            ))}
          </div>
        )}

        {/* Resumo Clínico Educativo */}
        <p id={descId} className="text-sm leading-relaxed text-foreground/85 font-medium mb-5 break-words">
          {insight.clinical_summary}
        </p>

        {/* Card Fale com seu médico com botão Copiar */}
        <div className="rounded-2xl border border-border/80 bg-muted/40 p-3.5 mb-5 flex items-start justify-between gap-3 transition-colors hover:bg-muted/60">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-muted-foreground block mb-0.5">
              Fale com seu médico:
            </span>
            <p className="text-xs leading-relaxed text-foreground font-medium italic break-words">
              &ldquo;{insight.doctor_question}&rdquo;
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            data-testid="copy-question-btn"
            // min 44×44 (alvo de toque) + rótulo em rem (escala com a fonte do usuário)
            className="shrink-0 flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Copiar pergunta para o médico"
            aria-label={copied ? 'Pergunta copiada' : 'Copiar pergunta para o médico'}
            aria-live="polite"
          >
            {copied ? (
              <>
                <CheckRoundedIcon sx={{ fontSize: 17, color: '#10b981' }} />
                <span className="text-[0.625rem] font-bold text-emerald-600 dark:text-emerald-400">
                  Copiado!
                </span>
              </>
            ) : (
              <>
                <ContentCopyRoundedIcon sx={{ fontSize: 17 }} />
                <span className="text-[0.625rem] font-bold">Copiar</span>
              </>
            )}
          </button>
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            data-testid="bottomsheet-primary-btn"
            className="w-full min-h-12 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold py-3 px-4 text-sm shadow-md transition-all active:scale-[0.99] cursor-pointer break-words"
          >
            {insight.primary_action || 'Entendido'}
          </button>

          {insight.secondary_action && (
            <button
              type="button"
              data-testid="bottomsheet-secondary-btn"
              onClick={() => {
                handleCopy();
                handleDismiss();
              }}
              className="w-full min-h-11 rounded-full border border-border bg-card hover:bg-muted text-foreground font-semibold py-2.5 px-4 text-xs transition-all cursor-pointer break-words"
            >
              {insight.secondary_action}
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
};

