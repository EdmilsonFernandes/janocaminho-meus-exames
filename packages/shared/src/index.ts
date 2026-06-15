// Tipos/DTOs compartilhados entre server e web.

export type ExamKind = 'LAB_PANEL' | 'IMAGING' | 'OTHER';
export type ExamStatus = 'UPLOADED' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED';
export type ItemFlag = 'NORMAL' | 'HIGH' | 'LOW' | 'ABNORMAL' | 'CRITICAL' | 'UNKNOWN';

export interface ExamSummary {
  id: string;
  title: string;
  kind: ExamKind;
  status: ExamStatus;
  performedAt: string | null;
  sourceLab: string | null;
  pageCount: number;
  reviewRequired: boolean;
  extractionError: string | null;
}

export interface TimeSeriesPoint {
  examId: string;
  performedAt: string | null;
  title: string;
  valueNumeric: number;
  unit: string | null;
  flag: ItemFlag;
}
