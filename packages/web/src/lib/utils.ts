import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** `cn` do ecossistema shadcn — usado pelos componentes ReUI da ilha doctor-v2.
 *  Fora da ilha, o app continua usando `sx` do MUI. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
