import { Button } from "@/components/ui/button"

export function SearchSuggestions() {
  return (
    <div className="flex w-full flex-col items-start gap-3">
      <p className="text-muted-foreground text-sm">Try these searches</p>
      {/* Actions */}
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-full"
        >
          &quot;meeting transcript&quot;
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-full"
        >
          #launch-plan
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 rounded-full"
        >
          &quot;handoff notes&quot;
        </Button>
      </div>
    </div>
  )
}