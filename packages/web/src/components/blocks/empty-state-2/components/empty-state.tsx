import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { SearchEmptyIllustration } from "./search-empty-illustration"
import { SearchSuggestions } from "./search-suggestions"
import { PlayIcon, Settings2Icon } from "lucide-react"

export function EmptyState() {
  return (
    <div className="flex min-h-[820px] w-full max-w-3xl flex-col items-center justify-center gap-24 py-8 sm:gap-32 md:py-12">
      {/* Empty State */}
      <Empty className="flex-none gap-7 rounded-none border-0 p-0 md:p-0">
        <EmptyHeader className="max-w-md gap-4">
          <EmptyMedia className="mb-0">
            <SearchEmptyIllustration />
          </EmptyMedia>

          <div className="flex flex-col items-center gap-2">
            <EmptyTitle className="text-2xl font-semibold tracking-tight">
              No search matches yet
            </EmptyTitle>
            <EmptyDescription className="max-w-[25rem] text-sm/relaxed">
              Broaden your query or browse the library to explore files, notes,
              and tagged moments across the workspace.
            </EmptyDescription>
          </div>
        </EmptyHeader>

        <EmptyContent className="max-w-none gap-0">
          <ButtonGroup className="**:data-[slot=button]:border-r-0">
            <Button type="button">
              <PlayIcon className="fill-current" data-icon="inline-start" aria-hidden="true" />
              Browse library
            </Button>

            <Button type="button" variant="outline">
              <Settings2Icon data-icon="inline-start" aria-hidden="true" />
              Refine filters
            </Button>
          </ButtonGroup>
        </EmptyContent>
      </Empty>

      <div className="w-full max-w-md sm:max-w-136">
        <SearchSuggestions />
      </div>
    </div>
  )
}