import { cn } from "cn"
import { tr } from "@/lib/i18n"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={tr("common.loadingData")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
