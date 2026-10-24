"use client"

// ============================================================================
// ReUI stepper (reui.io registry port) — self-contained, no external
// primitive dependency. Controlled API: <Stepper value onValueChange
// orientation indicators>. State is derived per item (completed < value,
// active === value, inactive > value) and published as data-state on every
// part + a `group/step` scope on StepperItem so descendant utility variants
// like `group-data-[state=completed]/step:bg-success` work (the styling the
// reui block demos rely on). `indicators` swaps the default content per
// state: completed → the completed node (default: a check), inactive → the
// inactive node when provided (default: the step number or the trigger's
// children), active → the loading node when the item carries `loading`
// (the c-stepper-44 trick: every item passes the flag so the spinner
// follows the selection).
// Ported for RMIS: colors ride the theme tokens (bg-border, bg-success →
// --ok green, bg-primary); default active fill is the Electric Blue capsule.
// ============================================================================

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type StepperOrientation = "horizontal" | "vertical"
type StepperState = "active" | "completed" | "inactive"

interface StepperContextValue {
  value: number
  setValue: (value: number) => void
  orientation: StepperOrientation
  indicators?: StepperIndicators
}

export interface StepperIndicators {
  completed?: React.ReactNode
  inactive?: React.ReactNode
  loading?: React.ReactNode
}

const StepperContext = React.createContext<StepperContextValue | null>(null)

const StepperNavContext = React.createContext<{ lastStep: number | null }>({
  lastStep: null,
})

interface StepperItemContextValue {
  step: number
  state: StepperState
  isLast: boolean
  loading: boolean
}

const StepperItemContext = React.createContext<StepperItemContextValue | null>(null)

function useStepperContext(componentName: string): StepperContextValue {
  const context = React.useContext(StepperContext)
  if (!context) {
    throw new Error(`Use <${componentName}> within <Stepper>`)
  }
  return context
}

function useStepperItemContext(componentName: string): StepperItemContextValue {
  const context = React.useContext(StepperItemContext)
  if (!context) {
    throw new Error(`Use <${componentName}> within <StepperItem>`)
  }
  return context
}

/** Reads the enclosing StepperItem's state — so what is announced (or
 *  rendered by custom descendants) cannot drift from the data-state the
 *  trigger is styled by. */
function useStepItem(): StepperItemContextValue {
  return useStepperItemContext("useStepItem")
}

function getStepState(step: number, value: number): StepperState {
  return step === value ? "active" : step < value ? "completed" : "inactive"
}

interface StepperProps extends React.ComponentProps<"div"> {
  value: number
  onValueChange?: (value: number) => void
  orientation?: StepperOrientation
  indicators?: StepperIndicators
}

function Stepper({
  value,
  onValueChange,
  orientation = "horizontal",
  indicators,
  className,
  children,
  ...props
}: StepperProps) {
  const setValue = React.useCallback(
    (newValue: number) => onValueChange?.(newValue),
    [onValueChange]
  )

  const contextValue = React.useMemo(
    () => ({ value, setValue, orientation, indicators }),
    [value, setValue, orientation, indicators]
  )

  return (
    <StepperContext.Provider value={contextValue}>
      <div
        data-slot="stepper"
        data-orientation={orientation}
        className={cn("group/stepper", className)}
        {...props}
      >
        {children}
      </div>
    </StepperContext.Provider>
  )
}

function StepperNav({
  className,
  children,
  ...props
}: React.ComponentProps<"ol">) {
  const { orientation } = useStepperContext("StepperNav")

  // Highest step among the direct StepperItem children — StepperItem uses it
  // to flag isLast (which hides its trailing separator).
  const lastStep = React.useMemo(() => {
    let max: number | null = null
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const step = (child.props as { step?: unknown }).step
        if (typeof step === "number") {
          max = max == null ? step : Math.max(max, step)
        }
      }
    })
    return max
  }, [children])

  return (
    <StepperNavContext.Provider value={{ lastStep }}>
      <ol
        data-slot="stepper-nav"
        data-orientation={orientation}
        className={cn(
          "group/stepper-nav flex items-center",
          orientation === "vertical" && "flex-col items-stretch",
          className
        )}
        {...props}
      >
        {children}
      </ol>
    </StepperNavContext.Provider>
  )
}

interface StepperItemProps extends React.ComponentProps<"li"> {
  step: number
  /**
   * Optional explicit state override. By default state derives from the
   * stepper value (linear wizard semantics); pass `state` when progress
   * comes from data instead — e.g. profile sections that complete out of
   * order must still read Completed while the user is elsewhere.
   */
  state?: StepperState
  /**
   * c-stepper-44 — show the `loading` indicator on this item while it is
   * the active step. Every item can carry the flag; the spinner follows
   * the selection because only the active step renders it.
   */
  loading?: boolean
}

function StepperItem({
  step,
  state: stateProp,
  loading = false,
  className,
  children,
  ...props
}: StepperItemProps) {
  const { value } = useStepperContext("StepperItem")
  const { lastStep } = React.useContext(StepperNavContext)
  const state = stateProp ?? getStepState(step, value)
  const isLast = lastStep != null ? step >= lastStep : false

  const itemContextValue = React.useMemo(
    () => ({ step, state, isLast, loading }),
    [step, state, isLast, loading]
  )

  return (
    <StepperItemContext.Provider value={itemContextValue}>
      <li
        data-slot="stepper-item"
        data-state={state}
        className={cn("group/step flex items-center", className)}
        {...props}
      >
        {children}
      </li>
    </StepperItemContext.Provider>
  )
}

function StepperTrigger({
  className,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { setValue } = useStepperContext("StepperTrigger")
  const { step, state } = useStepperItemContext("StepperTrigger")

  return (
    <button
      type="button"
      data-slot="stepper-trigger"
      data-state={state}
      aria-current={state === "active" ? "step" : undefined}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setValue(step)
      }}
      className={cn(
        "flex items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function StepperIndicator({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  const { indicators } = useStepperContext("StepperIndicator")
  const { step, state, loading } = useStepperItemContext("StepperIndicator")

  let content: React.ReactNode
  if (state === "completed") {
    content = indicators?.completed ?? <CheckIcon className="size-3.5" />
  } else if (state === "active" && loading && indicators?.loading) {
    content = indicators.loading
  } else if (state === "inactive" && indicators?.inactive) {
    content = indicators.inactive
  } else {
    content = children ?? step
  }

  return (
    <span
      data-slot="stepper-indicator"
      data-state={state}
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 select-none items-center justify-center rounded-full border border-transparent bg-primary text-[13px] font-medium leading-none text-primary-foreground",
        className
      )}
      {...props}
    >
      {content}
    </span>
  )
}

function StepperTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="stepper-title"
      className={cn("text-sm font-semibold leading-snug text-foreground", className)}
      {...props}
    >
      {children}
    </span>
  )
}

function StepperDescription({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="stepper-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    >
      {children}
    </span>
  )
}

function StepperSeparator({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { orientation } = useStepperContext("StepperSeparator")
  const { isLast, state } = useStepperItemContext("StepperSeparator")

  if (isLast) return null

  return (
    <span
      data-slot="stepper-separator"
      data-state={state}
      aria-hidden="true"
      className={cn(
        "m-0 bg-border group-data-[state=completed]/step:bg-success",
        orientation === "horizontal" ? "h-0.5 w-full flex-1" : "w-px flex-1",
        className
      )}
      {...props}
    />
  )
}

function StepperPanel({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-panel"
      className={cn("w-full", className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface StepperContentProps extends React.ComponentProps<"div"> {
  value: number
}

function StepperContent({
  value,
  className,
  children,
  ...props
}: StepperContentProps) {
  const { value: activeValue } = useStepperContext("StepperContent")

  if (value !== activeValue) return null

  return (
    <div
      data-slot="stepper-content"
      className={cn("w-full", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  Stepper,
  StepperNav,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperTitle,
  StepperDescription,
  StepperSeparator,
  StepperPanel,
  StepperContent,
  useStepItem,
}
