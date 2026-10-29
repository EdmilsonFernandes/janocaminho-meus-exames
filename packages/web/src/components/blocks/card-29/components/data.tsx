import { type ReactNode } from "react"
import { type BadgeProps } from "@/components/reui/badge"
import { ShoppingBagIcon, TrendingUp, CreditCardIcon, TrendingDown, CircleDollarSignIcon, BarChart3Icon } from "lucide-react"

export interface ICard {
  valueBold: string
  valueFaint: string
  title: string
  icon: ReactNode
  description: string
  badge: string
  variant: BadgeProps["variant"]
  badgeIcon?: ReactNode
}

export const CARDS: ICard[] = [
  {
    icon: (
      <ShoppingBagIcon aria-hidden="true" className="size-5 text-muted-foreground" />
    ),
    title: "Total Orders",
    valueBold: "1,246",
    valueFaint: "",
    description: "Tracks overall orders placed within the selected timeframe",
    badge: "239",
    variant: "success-light",
    badgeIcon: (
      <TrendingUp aria-hidden="true" className="size-3.5" />
    ),
  },
  {
    icon: (
      <CreditCardIcon aria-hidden="true" className="size-5 text-muted-foreground" />
    ),
    title: "Cumulative Spend",
    valueBold: "$89,378",
    valueFaint: ".02",
    description: "Total amount spent across all transactions to date",
    badge: "$4K",
    variant: "warning-light",
    badgeIcon: (
      <TrendingDown aria-hidden="true" className="size-3.5" />
    ),
  },
  {
    icon: (
      <CircleDollarSignIcon aria-hidden="true" className="size-5 text-muted-foreground" />
    ),
    title: "Avg. Order Value(AOV)",
    valueBold: "$68",
    valueFaint: ".50",
    description: "Average revenue earned per order during reporting period",
    badge: "$17",
    variant: "success-light",
    badgeIcon: (
      <TrendingUp aria-hidden="true" className="size-3.5" />
    ),
  },
  {
    icon: (
      <BarChart3Icon aria-hidden="true" className="size-5 text-muted-foreground" />
    ),
    title: "Account Balance",
    valueBold: "$31,345",
    valueFaint: ".21",
    description: "Current available balance based on latest account activity",
    badge: "$3K",
    variant: "success-light",
    badgeIcon: (
      <TrendingUp aria-hidden="true" className="size-3.5" />
    ),
  },
]