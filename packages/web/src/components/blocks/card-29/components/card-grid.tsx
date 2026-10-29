import { Frame, FramePanel } from "@/components/reui/frame"

import { CardItem } from "./card-item"
import { CARDS, type ICard } from "./data"

/** Adaptado p/ Dr. Exame: aceita cartões REAIS via props (fallback = demo do registry). */
export function CardGrid({ cards = CARDS }: { cards?: ICard[] }) {
  return (
    <div className="@container w-full">
      <Frame className="w-full">
        <FramePanel className="p-0!">
          <div className="grid overflow-hidden @2xl:grid-cols-2 @4xl:grid-cols-4">
            {cards.map((card, index) => (
              <CardItem
                key={card.description}
                card={card}
                index={index}
                total={cards.length}
              />
            ))}
          </div>
        </FramePanel>
      </Frame>
    </div>
  )
}