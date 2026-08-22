/**
 * Camada de providers de preço — o app NUNCA acopla numa farmácia específica.
 *
 *   MedicationPriceProvider
 *    ├── mercadoLivre (v1: ld+json da página de lista — VER AVISO LEGAL no arquivo)
 *    ├── deeplink (links de busca, sem preço — fallback)
 *    └── (futuro: ML OAuth afiliados, Panvel/CR adapters no worker isolado, ANVISA p/ EAN)
 *
 * Privacidade: o provider recebe APENAS { activeIngredient, dosage, form, packQty } —
 * nunca nome/CPF/exames/qualquer dado do paciente (FASE 17).
 */
import type { NormalizedMedication } from './normalize';

export interface PriceOffer {
  pharmacy: string;
  productName: string;
  priceCents: number;
  url: string;
}

export interface MedicationPriceProvider {
  readonly name: string;
  search(normalized: NormalizedMedication): Promise<PriceOffer[]>;
}

export const priceProvidersEnabled = (): boolean => process.env.PRICE_PROVIDERS_OFF !== '1';

/**
 * Provider ATIVO. O adapter Mercado Livre (HTML público) revelou-se INSTÁVEL em campo
 * (challenge "suspicious-traffic" após poucas requests — recon 2026-08-22). Por isso ele
 * é OPT-IN: PRICE_ML_ENABLED=true. Produção fica sem provider real até entrarmos numa
 * fonte sustentável (app OAuth do ML Afiliados ou adapter de farmácia validado no
 * worker isolado) — o pipeline inteiro (worker/cache/estados/card) já está pronto e
 * coberto por testes com provider fake; ligar a fonte é 1 env var.
 */
export class ProviderRegistry {
  private static override: MedicationPriceProvider | null = null;
  static setOverride(p: MedicationPriceProvider | null) { ProviderRegistry.override = p; }
  static get default(): MedicationPriceProvider | null {
    if (ProviderRegistry.override) return ProviderRegistry.override;
    if (process.env.PRICE_ML_ENABLED === 'true') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { mercadoLivreProvider } = require('./providers/mercadoLivre');
      return mercadoLivreProvider;
    }
    return null; // sem fonte real habilitada → worker marca not_requested (não erro)
  }
}
