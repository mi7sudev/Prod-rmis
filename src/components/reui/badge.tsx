import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * ReUI badge (reui.io registry port) — the soft "light" variants power the
 * stepper's state pills (In Progress / Completed / Pending). Colors ride the
 * RMIS theme tokens: success maps to the --ok green (globals.css
 * --color-success), primary-light is a 10% tint of the Electric Blue.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        destructive: "border-transparent bg-destructive text-white",
        success: "border-transparent bg-success text-white",
        "primary-light": "border-transparent bg-primary/10 text-primary",
        "secondary-light": "border-transparent bg-secondary/60 text-secondary-foreground",
        "success-light": "border-transparent bg-success/10 text-success",
        "warning-light": "border-transparent bg-warn-bg text-warn",
        "info-light": "border-transparent bg-info-bg text-info",
        "destructive-light": "border-transparent bg-destructive/10 text-destructive",
      },
      size: {
        default: "text-xs",
        sm: "px-1.5 text-[11px] leading-[1.35]",
        xs: "px-1.5 py-0 text-[10px] leading-[1.4]",
        lg: "px-2.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
