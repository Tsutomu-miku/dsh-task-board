import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle } from "lucide-react"
import { cn } from "../../lib/utils"

const alertVariants = cva(
  "relative flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-5",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary/70 text-foreground",
        destructive: "border-[color-mix(in_srgb,var(--board-danger)_28%,transparent)] bg-[var(--board-danger-soft)] text-[var(--board-danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {variant === "destructive" && <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("min-w-0 wrap-anywhere", className)} {...props} />
}

export { Alert, AlertDescription }
