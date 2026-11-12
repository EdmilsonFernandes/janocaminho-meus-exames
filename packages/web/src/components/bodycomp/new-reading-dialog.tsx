/**
 * Diálogo "Nova avaliação", três jeitos:
 *  - LAUDO de qualquer marca (PDF ou foto) — o servidor lê o texto (pdftotext/OCR) e a IA
 *    extrai os números, só os que estão escritos no laudo;
 *  - QR da folha InBody (foto, imagem ou link colado);
 *  - valores digitados.
 *
 * Laudo e QR nunca gravam direto: o servidor devolve uma PRÉVIA e o usuário confere os
 * valores com o papel antes de salvar — erro de leitura aqui é dado de saúde errado.
 */
import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Camera, FileText, ImageIcon, Info, QrCode, TriangleAlert } from 'lucide-react';
import { API_URL, token } from '../../config';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { METRICS, deviceLabel, formatDate, formatWithUnit, type MetricKey } from './model';

type Mode = 'report' | 'qr' | 'manual';
type Preview = {
  measuredAt: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  needsReview: boolean;
} & Partial<Record<MetricKey, number | null>>;

const PREVIEW_KEYS: MetricKey[] = [
  'weightKg', 'bodyFatPct', 'fatMassKg', 'skeletalMuscleKg', 'fatFreeMassKg', 'bodyWaterL', 'proteinKg', 'mineralKg', 'bmi', 'bmrKcal', 'waistHipRatio', 'visceralFatLevel',
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envio do laudo (multipart; PDF, JPG ou PNG). A leitura roda em segundo plano no servidor
 * (OCR + IA passam de 60s): o envio devolve um jobId e aqui consultamos até 3 minutos.
 */
async function postReport(file: File) {
  const auth = { Authorization: `Bearer ${token()}` };
  const body = new FormData();
  body.append('file', file);
  const sent = await fetch(`${API_URL}/body-composition/report`, { method: 'POST', headers: auth, body });
  const started = await sent.json().catch(() => ({}));
  if (!sent.ok || !started?.jobId) throw new Error(started?.error || 'Não consegui enviar este laudo. Tente de novo ou digite os valores.');
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await wait(2500);
    const polled = await fetch(`${API_URL}/body-composition/report/${encodeURIComponent(started.jobId)}`, { headers: auth }).catch(() => null);
    if (!polled) continue; // rede oscilou: tenta de novo na próxima volta
    const json = await polled.json().catch(() => ({}));
    if (polled.ok && json?.status === 'done') return json as { preview: Preview };
    if (!polled.ok) throw new Error(json?.error || 'Não consegui ler este laudo. Tente de novo ou digite os valores.');
  }
  throw new Error('A leitura está demorando mais que o normal. Tente de novo em instantes ou digite os valores.');
}

/** Lê o QR de uma imagem. Folha fotografada costuma vir grande e levemente torta: tenta três escalas. */
async function decodeQr(file: File): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('imagem inválida'));
      img.src = url;
    });
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    for (const target of [1600, 1000, 2400]) {
      const scale = Math.min(1, target / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      if (found?.data) return found.data;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${API_URL}/body-composition${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || 'Não foi possível concluir. Tente de novo.');
  return json;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col justify-end gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {hint ? <span className="font-normal text-muted-foreground"> · {hint}</span> : null}
      </label>
      {children(id)}
    </div>
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const EMPTY_FORM = {
  measuredAt: '', weightKg: '', bodyFatPct: '', skeletalMuscleKg: '', bodyWaterL: '', visceralFatLevel: '', bmrKcal: '', deviceBrand: '', deviceModel: '',
};

export function NewReadingDialog({
  open,
  onOpenChange,
  patientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string | null | undefined;
  /** Chamado depois de gravar; `duplicate` = a folha já estava registrada. */
  onSaved: (result: { duplicate: boolean }) => void;
}) {
  const [mode, setMode] = useState<Mode>('report');
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState('');
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKind, setPreviewKind] = useState<'qr' | 'report'>('qr');
  const [reportDate, setReportDate] = useState('');
  const reportInput = useRef<HTMLInputElement>(null);
  const reportCamera = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, measuredAt: today() });
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setBusy(null); setError(null); setPayload(''); setLink(''); setPreview(null); setReportDate('');
    setForm({ ...EMPTY_FORM, measuredAt: today() });
  };
  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const check = async (text: string) => {
    setError(null);
    setBusy('reading');
    try {
      const json = await post('/inbody-qr', { payload: text.trim(), dryRun: true });
      setPayload(text.trim());
      setPreviewKind('qr');
      setPreview(json.preview as Preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setBusy('reading');
    try {
      const text = await decodeQr(file);
      if (!text) {
        setError('Não encontrei um QR code nesta imagem. Aproxime a câmera do código, com boa luz e sem reflexo, e tente de novo.');
        setBusy(null);
        return;
      }
      await check(text);
    } catch {
      setError('Não consegui abrir esta imagem. Tente outra foto.');
      setBusy(null);
    }
  };

  const onReport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) { setError('Arquivo grande demais (máximo 35 MB).'); return; }
    setError(null);
    setBusy('reading');
    try {
      const json = await postReport(file);
      setPreviewKind('report');
      setReportDate(json.preview.measuredAt ? json.preview.measuredAt.slice(0, 10) : '');
      setPreview(json.preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveReport = async () => {
    if (!preview) return;
    if (!reportDate) { setError('Informe a data da avaliação — não encontrei no laudo.'); return; }
    setError(null);
    setBusy('saving');
    try {
      const values = Object.fromEntries(PREVIEW_KEYS.filter((key) => preview[key] != null).map((key) => [key, preview[key]]));
      await post('', { ...values, measuredAt: reportDate, deviceBrand: preview.deviceBrand, deviceModel: preview.deviceModel, source: 'REPORT', patientId });
      reset();
      onOpenChange(false);
      onSaved({ duplicate: false });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const saveQr = async () => {
    setError(null);
    setBusy('saving');
    try {
      const json = await post('/inbody-qr', { payload, patientId });
      reset();
      onOpenChange(false);
      onSaved({ duplicate: !!json.duplicate });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const saveManual = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.weightKg.trim() || (!form.bodyFatPct.trim() && !form.skeletalMuscleKg.trim())) {
      setError('Informe o peso e pelo menos o percentual de gordura ou a massa muscular.');
      return;
    }
    setBusy('saving');
    try {
      await post('', { ...form, patientId });
      reset();
      onOpenChange(false);
      onSaved({ duplicate: false });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const set = (key: keyof typeof EMPTY_FORM) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const number = (key: keyof typeof EMPTY_FORM) => (id: string) => (
    <Input id={id} inputMode="decimal" autoComplete="off" value={form[key]} onChange={set(key)} className="h-10" />
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova avaliação</DialogTitle>
          <DialogDescription>
            {preview ? 'Confira com a folha impressa antes de salvar.' : 'Registre o resultado de uma bioimpedância.'}
          </DialogDescription>
        </DialogHeader>

        {preview ? null : (
          <ToggleGroup
            value={[mode]}
            onValueChange={(next) => { if (next[0]) { setMode(next[0] as Mode); setError(null); } }}
            variant="outline"
            spacing={0}
            className="w-full"
            aria-label="Como registrar"
          >
            <ToggleGroupItem value="report" className="flex-1">
              <FileText aria-hidden="true" /> Laudo
            </ToggleGroupItem>
            <ToggleGroupItem value="qr" className="flex-1">
              <QrCode aria-hidden="true" /> QR InBody
            </ToggleGroupItem>
            <ToggleGroupItem value="manual" className="flex-1">Digitar</ToggleGroupItem>
          </ToggleGroup>
        )}

        {error ? (
          <Alert variant="destructive" className="transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] starting:opacity-0">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        {preview ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {preview.measuredAt ? <span className="text-sm font-semibold tabular-nums">{formatDate(preview.measuredAt)}</span> : null}
              <Badge variant="outline">{deviceLabel({ ...preview, source: previewKind === 'qr' ? 'INBODY_QR' : 'REPORT' })}</Badge>
            </div>
            {previewKind === 'report' ? (
              <>
                <Alert variant="info">
                  <Info aria-hidden="true" />
                  <AlertTitle>Lido automaticamente do laudo</AlertTitle>
                  <AlertDescription>
                    <p className="m-0">Compare cada valor com o papel. Se algum não bater, toque em “Não confere” e digite os valores.</p>
                  </AlertDescription>
                </Alert>
                <Field label="Data da avaliação" hint={preview.measuredAt ? 'lida do laudo' : 'não encontrei no laudo'}>
                  {(id) => <Input id={id} type="date" max={today()} value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="h-10" />}
                </Field>
              </>
            ) : preview.needsReview ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Modelo ainda não conferido</AlertTitle>
                <AlertDescription>
                  <p className="m-0">A leitura deste modelo de aparelho ainda não foi validada por nós. Compare cada valor com a folha; se algum não bater, cancele e digite os valores.</p>
                </AlertDescription>
              </Alert>
            ) : null}
            <dl className="m-0 flex flex-col divide-y divide-border rounded-lg border border-border">
              {PREVIEW_KEYS.map((key) => {
                const value = preview[key];
                if (value == null) return null;
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <dt className="text-muted-foreground">{METRICS[key].label}</dt>
                    <dd className="m-0 font-medium tabular-nums">{formatWithUnit(key, value)}</dd>
                  </div>
                );
              })}
            </dl>
            <DialogFooter>
              <Button variant="outline" size="lg" disabled={!!busy} onClick={() => { setPreview(null); setPayload(''); setError(null); }}>
                Não confere
              </Button>
              <Button size="lg" disabled={!!busy} onClick={previewKind === 'report' ? saveReport : saveQr}>
                {busy === 'saving' ? <Spinner aria-hidden="true" /> : null}
                Salvar avaliação
              </Button>
            </DialogFooter>
          </>
        ) : mode === 'report' ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-muted-foreground">
              Envie o resultado da bioimpedância de qualquer aparelho — PDF ou foto da folha. Lemos só as medidas; nada é gravado antes de você conferir.
            </p>
            <input ref={reportInput} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={onReport} />
            <input ref={reportCamera} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={onReport} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button size="lg" className="h-11" disabled={!!busy} onClick={() => reportInput.current?.click()}>
                {busy === 'reading' ? <Spinner aria-hidden="true" /> : <FileText aria-hidden="true" />}
                {busy === 'reading' ? 'Lendo o laudo…' : 'Escolher PDF ou foto'}
              </Button>
              <Button variant="outline" size="lg" className="h-11" disabled={!!busy} onClick={() => reportCamera.current?.click()}>
                <Camera aria-hidden="true" />
                Fotografar a folha
              </Button>
            </div>
            <p className="m-0 text-xs text-muted-foreground">Foto: folha inteira, de frente, com boa luz e sem sombra. A leitura costuma levar de 30 segundos a 2 minutos.</p>
          </div>
        ) : mode === 'qr' ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-muted-foreground">
              A folha de resultado InBody traz um QR code. Fotografe só o código, de perto. Usamos apenas as medidas — número de série e telefone são descartados.
            </p>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button size="lg" className="h-11" disabled={!!busy} onClick={() => cameraInput.current?.click()}>
                {busy === 'reading' ? <Spinner aria-hidden="true" /> : <Camera aria-hidden="true" />}
                Fotografar o QR
              </Button>
              <Button variant="outline" size="lg" className="h-11" disabled={!!busy} onClick={() => galleryInput.current?.click()}>
                <ImageIcon aria-hidden="true" />
                Escolher imagem
              </Button>
            </div>
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => { event.preventDefault(); if (link.trim()) void check(link); }}
            >
              <Field label="Ou cole o link do QR" hint="o endereço que o leitor do celular mostra">
                {(id) => (
                  <div className="flex gap-2">
                    <Input id={id} value={link} onChange={(event) => setLink(event.target.value)} autoComplete="off" className="h-10" />
                    <Button type="submit" variant="outline" size="lg" className="h-10" disabled={!!busy || link.trim().length < 60}>
                      Conferir
                    </Button>
                  </div>
                )}
              </Field>
            </form>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={saveManual}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data">
                {(id) => <Input id={id} type="date" max={today()} value={form.measuredAt} onChange={set('measuredAt')} className="h-10" />}
              </Field>
              <Field label="Peso" hint="kg">{number('weightKg')}</Field>
              <Field label="Gordura" hint="%">{number('bodyFatPct')}</Field>
              <Field label="Músculo" hint="kg">{number('skeletalMuscleKg')}</Field>
              <Field label="Água corporal" hint="L">{number('bodyWaterL')}</Field>
              <Field label="Visceral" hint="nível">{number('visceralFatLevel')}</Field>
              <Field label="Basal (TMB)" hint="kcal">{number('bmrKcal')}</Field>
              <Field label="Marca" hint="aparelho">
                {(id) => <Input id={id} value={form.deviceBrand} onChange={set('deviceBrand')} maxLength={40} autoComplete="off" className="h-10" />}
              </Field>
              <Field label="Modelo" hint="opcional">
                {(id) => <Input id={id} value={form.deviceModel} onChange={set('deviceModel')} maxLength={40} autoComplete="off" className="h-10" />}
              </Field>
            </div>
            <p className="m-0 text-xs text-muted-foreground">
              Obrigatório: peso e o percentual de gordura ou o músculo. Marca (Omron, Tanita, InBody…) importa: aparelhos diferentes medem de formas diferentes e não devem ser comparados entre si.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" disabled={!!busy} onClick={() => close(false)}>Cancelar</Button>
              <Button type="submit" size="lg" disabled={!!busy}>
                {busy === 'saving' ? <Spinner aria-hidden="true" /> : null}
                Salvar avaliação
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
