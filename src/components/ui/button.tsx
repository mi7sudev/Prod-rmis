import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * RMIS button system — cva surface for the two vendored blocks that still
 * call `buttonVariants` (alert-dialog, upload). It is NOT a second design
 * language: the geometry below is the canonical recipe from ui/buttons.ts —
 * control radius, 44px touch height, flat (no drop shadow), brand-600 fill.
 *
 * UI review 2026-10-20 · F4: this file used to render capsules (rounded-full),
 * 36px tall, with a drop shadow and a hover lift — three things the design
 * spec forbids and 26 other files do not do. Two "primary" buttons existed in
 * one bundle. They now resolve to the same anatomy.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-[var(--bad)] text-white hover:bg-[#8a3626]",
        outline:
          "border border-border bg-background text-foreground hover:bg-fog hover:border-[#c9d3e2]",
        secondary:
          "bg-accent text-accent-foreground hover:bg-[#e1e8f3]",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 min-h-[44px] px-4 has-[>svg]:px-3.5",
        sm: "tap-44 h-9 min-h-[36px] gap-1.5 px-3.5 text-meta has-[>svg]:px-3",
        lg: "h-12 min-h-[48px] px-6 has-[>svg]:px-5",
        xl: "h-12 min-h-[48px] px-7 text-ui has-[>svg]:px-6",
        xs: "tap-44 h-8 min-h-[32px] gap-1 px-2.5 text-caption has-[>svg]:px-2",
        icon: "size-11",
        "icon-sm": "tap-44 size-9",
        "icon-xs": "tap-44 size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
