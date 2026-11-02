import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { EyeIcon, EyeOffIcon, CheckIcon, CopyIcon } from "lucide-react"

/**
 * InputGroup (ReUI c-input-group-4 / c-input-group-6 / c-input-group-9 / c-input-group-11)
 * Wrapper unificado de campo de texto com suporte a prefixo/sufixo (ícone, R$, unidade,
 * botão de ação ou toggle de senha), mantendo altura mobile-first (min 40px).
 */
export function InputGroup({
  className,
  leading,
  trailing,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  leading?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "flex min-h-10 w-full items-center rounded-xl border border-input bg-card px-3 text-sm text-foreground transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 dark:bg-input/30",
        className
      )}
      {...props}
    >
      {leading && (
        <span className="mr-2 flex shrink-0 items-center text-muted-foreground select-none [&_svg]:size-4">
          {leading}
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {trailing && (
        <span className="ml-2 flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">
          {trailing}
        </span>
      )}
    </div>
  )
}

export function InputGroupAddon({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-addon"
      className={cn(
        "mr-2 flex shrink-0 items-center text-xs font-semibold text-muted-foreground select-none [&_svg]:size-4",
        className
      )}
      {...props}
    />
  )
}

export function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "h-9 w-full min-w-0 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

/**
 * PasswordInput (ReUI c-input-group-6) — campo de senha com botão olho acessível.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = React.useState(false)
  return (
    <InputGroup
      className={className}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      }
    >
      <InputGroupInput type={show ? "text" : "password"} {...props} />
    </InputGroup>
  )
}

/**
 * CopyableInput (ReUI c-input-group-11) — campo read-only com botão copiar e feedback Check.
 */
export function CopyableInput({
  value,
  onCopied,
  className,
}: {
  value: string
  onCopied?: () => void
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    try {
      navigator.clipboard?.writeText(value)
    } catch {
      /* noop */
    }
    setCopied(true)
    onCopied?.()
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <InputGroup
      className={cn("bg-muted/40", className)}
      trailing={
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar link"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors",
            copied
              ? "bg-success/15 text-success-foreground"
              : "bg-card text-foreground hover:bg-accent"
          )}
        >
          {copied ? (
            <>
              <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Copiado
            </>
          ) : (
            <>
              <CopyIcon className="size-3.5" />
              Copiar
            </>
          )}
        </button>
      }
    >
      <InputGroupInput readOnly value={value} className="truncate font-mono text-xs" />
    </InputGroup>
  )
}

/**
 * ReuiTextarea — Textarea alinhado aos tokens ReUI (`border-input`, `focus-visible:ring-3`).
 */
export function ReuiTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

/**
 * CircleCheckboxRow (ReUI c-checkbox-7 "Circle To-Do")
 * Checkbox circular que risca e suaviza o título quando marcado como concluído.
 */
export function CircleCheckboxRow({
  checked,
  onCheckedChange,
  title,
  subtitle,
  badge,
  actions,
  disabled,
  className,
}: {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 transition-colors hover:border-primary/30",
        checked && "bg-muted/35 opacity-85",
        className
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(val) => onCheckedChange?.(Boolean(val))}
        className="mt-0.5 size-5 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-sm font-semibold text-foreground transition-colors",
              checked && "line-through text-muted-foreground"
            )}
          >
            {title}
          </span>
          {badge}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}

/**
 * CardCheckbox (ReUI c-checkbox-9 "Setting Card")
 * Card clicável inteiro com Checkbox ReUI, título, descrição e ícone opcional.
 */
export function CardCheckbox({
  checked,
  onCheckedChange,
  title,
  description,
  icon,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all select-none",
        checked
          ? "border-primary bg-primary/6 shadow-2xs"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
        className
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(Boolean(v))}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {icon}
          <span>{title}</span>
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </label>
  )
}

export { Input as ReuiInput }

