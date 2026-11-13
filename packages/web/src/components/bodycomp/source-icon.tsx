/**
 * Ícone da FONTE de uma avaliação vinda do Health Connect — para o usuário reconhecer de
 * onde o número veio (ex.: Samsung Health = Galaxy Watch).
 *
 * Marca de terceiro só entra com o arquivo OFICIAL em `public/` (nunca redesenhada aqui).
 * Enquanto o arquivo não existir, cai no ícone do Health Connect (que já é do app) e, se
 * nem ele carregar, num relógio neutro.
 */
import { useState } from 'react';
import { Watch } from 'lucide-react';
import { cn } from 'cn';

/** Marca (como gravada em deviceBrand) → arquivo oficial em `public/`. */
const BRAND_FILES: Record<string, string> = {
  'Samsung Health': 'logo-samsung-health.png',
};
const HEALTH_CONNECT_FILE = 'hc-icon.png';

const assetUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export function SourceIcon({ brand, className }: { brand?: string | null; className?: string }) {
  const candidates = [brand ? BRAND_FILES[brand] : undefined, HEALTH_CONNECT_FILE].filter(Boolean) as string[];
  const [failed, setFailed] = useState(0);
  const file = candidates[failed];
  if (!file) return <Watch aria-hidden="true" className={className} />;
  return (
    <img
      src={assetUrl(file)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed((n) => n + 1)}
      className={cn('size-5 rounded-[5px] object-contain', className)}
    />
  );
}
