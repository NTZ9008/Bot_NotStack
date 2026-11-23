"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/hooks/use-theme"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon, XIcon } from '@/components/icons'

// unstyled: วาดเองด้วย token ของระบบ (พื้น popover, ขอบ, มุม 4px) — สีสถานะอยู่แค่แถบซ้ายกับไอคอน
const Toaster = ({ ...props }: ToasterProps) => {
  const [theme] = useTheme()
  return (
    <Sonner
      theme={theme === "light" ? "light" : "dark"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
        close: <XIcon className="size-4" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-2xl border border-l-[3px] bg-popover/95 py-3 pr-10 pl-3.5 backdrop-blur font-sans text-sm text-popover-foreground shadow-soft",
          icon: "mt-px flex shrink-0 text-muted-foreground",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "leading-snug font-semibold",
          description: "leading-snug text-muted-foreground",
          closeButton:
            // ! เพราะ sonner มีกฎ [data-sonner-theme] [data-close-button] ที่ใส่สีให้แม้ unstyled และ specificity สูงกว่า
            "absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full border-0 bg-transparent! text-muted-foreground! transition-colors hover:bg-accent! hover:text-foreground! focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          actionButton:
            "ml-auto shrink-0 self-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90",
          cancelButton:
            "shrink-0 self-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80",
          default: "border-l-foreground/30",
          success: "border-l-success [&_[data-icon]]:text-success",
          error: "border-l-destructive [&_[data-icon]]:text-destructive",
          warning: "border-l-warning [&_[data-icon]]:text-warning",
          info: "border-l-info [&_[data-icon]]:text-info",
          loading: "border-l-brand [&_[data-icon]]:text-brand",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
