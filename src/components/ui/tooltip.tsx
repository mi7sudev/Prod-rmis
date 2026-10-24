"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

/**
 * RMIS tooltip shell — the standard Radix tooltip mapped onto the house
 * overlay recipe (same tokens/anatomy as ui/popover: popover surface,
 * hairline border, the system's soft drop shadow, animate-in transitions).
 * The @radix-ui/react-tooltip primitive was already in the dependency tree;
 * this wrapper exists so the c-tooltip-5 block's "@/components/ui/tooltip"
 * import resolves to a surface that matches the system instead of shadcn's
 * dark slab. TooltipProvider passthrough included (the house motion tooltips
 * use their own provider; the two systems coexist).
 */

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 fade-in-0 zoom-in-95 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[rgba(0,0,0,0.15)_0px_2px_16px_0px] outline-hidden",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-popover fill-popover" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
