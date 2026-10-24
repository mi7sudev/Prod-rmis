"use client"

// ============================================================================
// ReUI timeline (reui.io registry port) — self-contained, no external
// primitive dependency (same port discipline as the stepper above; the
// official primitive leans on @base-ui/react merge-props/use-render, which
// this project does not carry). All utility classes are VERBATIM from
// https://reui.io/r/timeline.json (fetched 2026-10-21) so the official
// c-timeline-* block patterns style correctly; only the plumbing was
// simplified:
//   · useRender → plain host tags (div / time / h3 — the registry default
//     tag names; no caller needs the `render` escape hatch here)
//   · mergeProps → direct prop spread + cn
//   · cn from "@/lib/utils" (registry sources import it from "cn")
// API: <Timeline defaultValue|value onValueChange orientation> with
// TimelineItem step={n} — an item publishes `data-completed` when
// step <= activeStep (binary completed/pending; there is no separate
// "active" state — the c-timeline blocks treat the reached steps as
// completed). TimelineSeparator runs bg-primary/10 and flips to bg-primary
// wherever the NEXT sibling item is completed (the item's
// has-[+[data-completed]] variant), so progress reads as a filled spine
// through completed territory. TimelineDate renders a semantic <time>;
// TimelineIndicator a decorative dot (aria-hidden) whose children the block
// patterns replace (check / spinner / custom glyph) and gate with
// group-not-data-completed/timeline-item:hidden.
// ============================================================================

import { createContext, useCallback, useContext, useState } from "react"

import { cn } from "@/lib/utils"

// Types
type TimelineContextValue = {
  activeStep: number
  setActiveStep: (step: number) => void
}

// Context
const TimelineContext = createContext<TimelineContextValue | undefined>(
  undefined
)

const useTimeline = () => {
  const context = useContext(TimelineContext)
  if (!context) {
    throw new Error("useTimeline must be used within a Timeline")
  }
  return context
}

// Components
interface TimelineProps extends React.ComponentProps<"div"> {
  defaultValue?: number
  value?: number
  onValueChange?: (value: number) => void
  orientation?: "horizontal" | "vertical"
}

function Timeline({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = "vertical",
  className,
  children,
  ...props
}: TimelineProps) {
  const [internalStep, setInternalStep] = useState(defaultValue)

  const setActiveStep = useCallback(
    (step: number) => {
      if (value === undefined) {
        setInternalStep(step)
      }
      onValueChange?.(step)
    },
    [value, onValueChange]
  )

  const currentStep = value ?? internalStep

  return (
    <TimelineContext.Provider value={{ activeStep: currentStep, setActiveStep }}>
      <div
        className={cn(
          "group/timeline flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
          className
        )}
        data-orientation={orientation}
        data-slot="timeline"
        {...props}
      >
        {children}
      </div>
    </TimelineContext.Provider>
  )
}

// TimelineContent
function TimelineContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="timeline-content"
      {...props}
    >
      {children}
    </div>
  )
}

// TimelineDate
function TimelineDate({
  className,
  children,
  ...props
}: React.ComponentProps<"time">) {
  return (
    <time
      className={cn(
        "mb-1 block font-medium text-muted-foreground text-xs group-data-[orientation=vertical]/timeline:max-sm:h-4",
        className
      )}
      data-slot="timeline-date"
      {...props}
    >
      {children}
    </time>
  )
}

// TimelineHeader
function TimelineHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(className)}
      data-slot="timeline-header"
      {...props}
    >
      {children}
    </div>
  )
}

// TimelineIndicator
function TimelineIndicator({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden={true}
      className={cn(
        "group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute size-4 rounded-full border-2 border-primary/20 group-data-[orientation=vertical]/timeline:top-0 group-data-[orientation=horizontal]/timeline:left-0 group-data-completed/timeline-item:border-primary",
        className
      )}
      data-slot="timeline-indicator"
      {...props}
    >
      {children}
    </div>
  )
}

// TimelineItem
interface TimelineItemProps extends React.ComponentProps<"div"> {
  step: number
}

function TimelineItem({
  step,
  className,
  children,
  ...props
}: TimelineItemProps) {
  const { activeStep } = useTimeline()

  return (
    <div
      className={cn(
        "group/timeline-item relative flex flex-1 flex-col gap-0.5 group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=horizontal]/timeline:mt-8 group-data-[orientation=horizontal]/timeline:not-last:pe-8 group-data-[orientation=vertical]/timeline:not-last:pb-6 has-[+[data-completed]]:**:data-[slot=timeline-separator]:bg-primary",
        className
      )}
      data-completed={step <= activeStep || undefined}
      data-slot="timeline-item"
      {...props}
    >
      {children}
    </div>
  )
}

// TimelineSeparator
function TimelineSeparator({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden={true}
      className={cn(
        "group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute self-start bg-primary/10 group-last/timeline-item:hidden group-data-[orientation=horizontal]/timeline:h-0.5 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem-0.25rem)] group-data-[orientation=horizontal]/timeline:w-[calc(100%-1rem-0.25rem)] group-data-[orientation=vertical]/timeline:w-0.5 group-data-[orientation=horizontal]/timeline:translate-x-4.5 group-data-[orientation=vertical]/timeline:translate-y-4.5",
        className
      )}
      data-slot="timeline-separator"
      {...props}
    >
      {children}
    </div>
  )
}

// TimelineTitle
function TimelineTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("font-medium text-sm", className)}
      data-slot="timeline-title"
      {...props}
    >
      {children}
    </h3>
  )
}

export {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
}
