import * as React from "react"
import { cn } from "@/lib/utils"

export interface ReuiIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

/**
 * ReUI Ultimate Duotone: `health-medical-pulse`
 * Usado em Sinais Vitais & Relógio
 */
export function PulseIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z"
        fill="currentColor"
      />
      <path
        d="M3 12H6.5L8.5 7.5L11.5 16.5L14.5 9.5L16.5 12H21"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `security-shield-round`
 * Usado em Privacidade, LGPD & Controle de Dados
 */
export function ShieldRoundIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M12 2.75C12 2.75 19.25 4.75 19.25 11.25C19.25 17.25 14.5 20.25 12 21.25C9.5 20.25 4.75 17.25 4.75 11.25C4.75 4.75 12 2.75 12 2.75Z"
        fill="currentColor"
      />
      <path
        d="M12 2.75C12 2.75 19.25 4.75 19.25 11.25C19.25 17.25 14.5 20.25 12 21.25C9.5 20.25 4.75 17.25 4.75 11.25C4.75 4.75 12 2.75 12 2.75Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 12L11.1 13.85L15 9.75"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `communication-message-question`
 * Usado em Perguntas para o Médico
 */
export function MessageQuestionIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M4 6.5C4 4.84315 5.34315 3.5 7 3.5H17C18.6569 3.5 20 4.84315 20 6.5V14.5C20 16.1569 18.6569 17.5 17 17.5H9.5L5 20.5V17.5C4.44772 17.5 4 17.0523 4 16.5V6.5Z"
        fill="currentColor"
      />
      <path
        d="M4 6.5C4 4.84315 5.34315 3.5 7 3.5H17C18.6569 3.5 20 4.84315 20 6.5V14.5C20 16.1569 18.6569 17.5 17 17.5H9.5L5 20.5V17.5C4.44772 17.5 4 17.0523 4 16.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 8.75C10.25 7.7835 11.0335 7 12 7C12.9665 7 13.75 7.7835 13.75 8.75C13.75 9.54 13.22 10.2 12.5 10.42C12.19 10.52 12 10.8 12 11.12V11.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="14" r="0.9" fill="currentColor" />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `communication-message-text`
 * Usado no Chat IA (Dr. Exame)
 */
export function MessageTextIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M3.75 6.75C3.75 5.09315 5.09315 3.75 6.75 3.75H17.25C18.9069 3.75 20.25 5.09315 20.25 6.75V14.25C20.25 15.9069 18.9069 17.25 17.25 17.25H9.25L4.75 20.25V17.25C4.19772 17.25 3.75 16.8023 3.75 16.25V6.75Z"
        fill="currentColor"
      />
      <path
        d="M3.75 6.75C3.75 5.09315 5.09315 3.75 6.75 3.75H17.25C18.9069 3.75 20.25 5.09315 20.25 6.75V14.25C20.25 15.9069 18.9069 17.25 17.25 17.25H9.25L4.75 20.25V17.25C4.19772 17.25 3.75 16.8023 3.75 16.25V6.75Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 9H16M8 12.5H13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `health-medical-first-aid-kit`
 * Usado em Perfil Clínico / Médico
 */
export function FirstAidKitIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <rect
        opacity="0.24"
        x="3.5"
        y="6.5"
        width="17"
        height="13.5"
        rx="3"
        fill="currentColor"
      />
      <path
        d="M8.5 6.5V5C8.5 4.17157 9.17157 3.5 10 3.5H14C14.8284 3.5 15.5 4.17157 15.5 5V6.5M6.5 6.5H17.5C19.1569 6.5 20.5 7.84315 20.5 9.5V17C20.5 18.6569 19.1569 20 17.5 20H6.5C4.84315 20 3.5 18.6569 3.5 17V9.5C3.5 7.84315 4.84315 6.5 6.5 6.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 10.5V16M9.25 13.25H14.75"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `notification-bell`
 * Usado na Central de Notificações
 */
export function BellNotificationIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M6 9.5C6 6.18629 8.68629 3.5 12 3.5C15.3137 3.5 18 6.18629 18 9.5V14.2L19.6 16.6C19.9 17.05 19.58 17.65 19.04 17.65H4.96C4.42 17.65 4.1 17.05 4.4 16.6L6 14.2V9.5Z"
        fill="currentColor"
      />
      <path
        d="M6 9.5C6 6.18629 8.68629 3.5 12 3.5C15.3137 3.5 18 6.18629 18 9.5V14.2L19.6 16.6C19.9 17.05 19.58 17.65 19.04 17.65H4.96C4.42 17.65 4.1 17.05 4.4 16.6L6 14.2V9.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.75 18C10.1 19.4 10.95 20.25 12 20.25C13.05 20.25 13.9 19.4 14.25 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `emergency-medical-id`
 * Usado no Cartão de Emergência (Medical ID)
 */
export function SirenEmergencyIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <rect
        opacity="0.24"
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="3.5"
        fill="currentColor"
      />
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M12 8.5V15.5M8.5 12H15.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `vaccine-syringe`
 * Usado na Carteira de Vacinação
 */
export function SyringeVaccineIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M14.5 5.5L18.5 9.5L9.5 18.5L5.5 14.5L14.5 5.5Z"
        fill="currentColor"
      />
      <path
        d="M17.5 3.5L20.5 6.5M19 5L16.5 7.5M14.5 5.5L18.5 9.5L9.5 18.5L5.5 14.5L14.5 5.5ZM5.5 18.5L3.5 20.5M11.5 8.5L13.5 10.5M8.5 11.5L10.5 13.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * ReUI Ultimate Duotone: `finance-receipt-wallet`
 * Usado em Despesas Médicas & IRPF
 */
export function WalletReceiptIcon({ size = 24, className, ...props }: ReuiIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path
        opacity="0.24"
        d="M5 4.5C5 3.67157 5.67157 3 6.5 3H17.5C18.3284 3 19 3.67157 19 4.5V20L16.5 18.25L14.25 20L12 18.25L9.75 20L7.5 18.25L5 20V4.5Z"
        fill="currentColor"
      />
      <path
        d="M5 4.5C5 3.67157 5.67157 3 6.5 3H17.5C18.3284 3 19 3.67157 19 4.5V20L16.5 18.25L14.25 20L12 18.25L9.75 20L7.5 18.25L5 20V4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 8H15.5M8.5 11.5H15.5M8.5 15H12.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
