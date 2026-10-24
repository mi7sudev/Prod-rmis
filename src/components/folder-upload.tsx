"use client"

import * as React from "react"
import {
  formatBytes,
  type UploadAdapter,
  type Uploader,
  type UploadItem as UploadItemData,
  type ValidationOptions,
} from "@uploadcn/core"
import {
  useUploadContext,
  useUploadProgress,
  type UploadRootProps,
} from "@uploadcn/react"
import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import {
  Upload,
  UploadDropzone,
  UploadDropzoneDescription,
  UploadDropzoneTitle,
} from "@/components/ui/upload"

interface FolderUploadProps<TResult> extends Pick<
  ValidationOptions,
  "accept" | "maxSize" | "maxFiles"
> {
  adapter?: UploadAdapter<TResult>
  /** Use an uploader you created with `useUploader` instead of options. */
  uploader?: Uploader<TResult>
  /** Folder name shown on the tab. */
  name?: string
  title?: React.ReactNode
  description?: React.ReactNode
  /** Task 55 — additive presentation prop: "sm" renders the SAME blue
   *  folder at ~2/3 scale (smaller box/papers/front panel, softer lifts).
   *  Default "lg" is byte-identical to the original block. */
  size?: "sm" | "lg"
  /** Task 55 — disables the dropzone while a run holds the slot (the PDS
   *  pipeline must not be re-entered mid-run). Default false. */
  disabled?: boolean
  onSuccess?: (item: UploadItemData<TResult>) => void
  onComplete?: (items: UploadItemData<TResult>[]) => void
  className?: string
}

/**
 * A folder that opens when you hover or drag files over it. Dropped files
 * fly into the folder, and its front shows the upload progress.
 */
function FolderUpload<TResult = unknown>({
  adapter,
  uploader,
  name = "Uploads",
  title = "Drop files into the folder",
  description = "or click to browse",
  size = "lg",
  disabled = false,
  className,
  ...options
}: FolderUploadProps<TResult>) {
  return (
    <Upload
      {...((uploader
        ? { uploader, disabled }
        : {
            adapter,
            disabled,
            ...options,
          }) as UploadRootProps<TResult>)}
      className={cn("items-center", className)}
    >
      <UploadDropzone
        variant="muted"
        size={size}
        className="max-w-sm bg-transparent hover:bg-transparent data-dragging:bg-muted/40 data-dragging:ring-0"
      >
        <Folder name={name} small={size === "sm"} />
        <div className="flex flex-col items-center gap-1">
          <UploadDropzoneTitle>{title}</UploadDropzoneTitle>
          <FolderCaption fallback={description} />
        </div>
      </UploadDropzone>
    </Upload>
  )
}

interface FlyingFile {
  id: string
  name: string
  x: number
  rotate: number
}

function Folder({ name, small = false }: { name: string; small?: boolean }) {
  const { uploader } = useUploadContext()
  const summary = useUploadProgress(uploader)
  const reduceMotion = useReducedMotion()
  const [flying, setFlying] = React.useState<FlyingFile[]>([])
  const [gulp, setGulp] = React.useState(0)

  // Fly-in geometry per size — the small folder scales the drop path,
  // the horizontal spread and the chip proportionally (~2/3).
  const FLY = small
    ? { drop: -54, mid: -30, land: 52, spread: 20, chip: "h-8 w-24 text-[11px]" }
    : { drop: -70, mid: -40, land: 70, spread: 28, chip: "h-9 w-28 text-xs" }

  React.useEffect(
    () =>
      uploader.on("add", ({ items }) => {
        if (reduceMotion) return
        setFlying((current) => [
          ...current,
          ...items.slice(0, 6).map((item, index) => ({
            id: item.id,
            name: item.name,
            x: (index - (Math.min(items.length, 6) - 1) / 2) * FLY.spread,
            rotate: (index % 2 === 0 ? -1 : 1) * (4 + index * 2),
          })),
        ])
      }),
    [uploader, reduceMotion, FLY.spread]
  )

  const active = summary.isUploading
  const done = summary.isComplete

  return (
    <div
      aria-hidden
      className={cn(
        "relative select-none [perspective:900px]",
        small ? "h-32 w-40 [perspective:600px]" : "h-48 w-60"
      )}
    >
      {/* Back panel with the tab */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-primary/80 shadow-sm",
          small ? "h-28 rounded-xl rounded-tl-none" : "h-40 rounded-2xl rounded-tl-none"
        )}
      >
        <div
          className={cn(
            "absolute left-0 flex items-center bg-primary/80",
            small
              ? "-top-4 h-5 w-16 rounded-t-lg px-2"
              : "-top-5 h-6 w-24 rounded-t-xl px-3"
          )}
        >
          <span
            className={cn(
              "truncate font-medium text-primary-foreground/80",
              small ? "text-[10px]" : "text-xs"
            )}
          >
            {name}
          </span>
        </div>
      </div>

      {/* Papers peeking out */}
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={cn(
            "absolute border bg-background shadow-xs transition-transform duration-300 ease-out motion-reduce:transition-none",
            small
              ? "inset-x-3 bottom-1.5 h-24 rounded-md p-2 group-hover/upload-dropzone:-translate-y-2 group-data-dragging/upload-dropzone:-translate-y-5"
              : "inset-x-5 bottom-2 h-36 rounded-lg p-3 group-hover/upload-dropzone:-translate-y-3 group-data-dragging/upload-dropzone:-translate-y-8",
            index === 0 &&
              "-rotate-3 group-data-dragging/upload-dropzone:-rotate-6",
            index === 1 &&
              "rotate-2 group-data-dragging/upload-dropzone:rotate-4",
            index === 2 && "rotate-0"
          )}
          style={{ transitionDelay: `${index * 40}ms` }}
        >
          <div className={cn("rounded-full bg-muted", small ? "h-1 w-8" : "h-1.5 w-12")} />
          <div className={cn("mt-1.5 rounded-full bg-muted", small ? "h-1 w-14" : "h-1.5 w-20")} />
          <div className={cn("mt-1.5 rounded-full bg-muted", small ? "h-1 w-11" : "h-1.5 w-16")} />
        </div>
      ))}

      {/* Files flying in */}
      <AnimatePresence>
        {flying.map((file) => (
          <motion.div
            key={file.id}
            className={cn(
              "absolute top-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-md border bg-background px-2 font-medium shadow-md",
              FLY.chip
            )}
            initial={{ x: 0, y: FLY.drop, opacity: 0, rotate: 0, scale: 1 }}
            animate={{
              x: file.x,
              y: [FLY.drop, FLY.mid, FLY.land],
              opacity: [0, 1, 1],
              rotate: file.rotate,
              scale: [1, 1, 0.7],
            }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{
              duration: 0.75,
              times: [0, 0.35, 1],
              ease: "easeInOut",
            }}
            onAnimationComplete={() => {
              setFlying((current) =>
                current.filter((item) => item.id !== file.id)
              )
              setGulp((value) => value + 1)
            }}
          >
            <span className="size-3 shrink-0 rounded-sm bg-primary/70" />
            <span className="truncate">{file.name}</span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Front panel: tilts open on hover and drag */}
      <motion.div
        key={gulp}
        initial={reduceMotion || gulp === 0 ? false : { scale: 1 }}
        animate={
          reduceMotion || gulp === 0 ? undefined : { scale: [1, 1.04, 1] }
        }
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="absolute inset-x-0 bottom-0 z-20 origin-bottom"
        style={small ? { height: 72 } : { height: 112 }}
      >
        <div
          className={cn(
            "flex size-full origin-bottom flex-col justify-end bg-primary shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none",
            small ? "rounded-xl p-3" : "rounded-2xl p-4",
            "group-hover/upload-dropzone:[transform:rotateX(-14deg)] group-data-dragging/upload-dropzone:[transform:rotateX(-32deg)]"
          )}
        >
          <div className="flex items-center justify-between text-xs font-medium text-primary-foreground/85 tabular-nums">
            <span>
              {summary.total === 0
                ? "Empty"
                : `${summary.total} file${summary.total === 1 ? "" : "s"}`}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              {done ? (
                <motion.span
                  key="done"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex size-4 items-center justify-center rounded-full bg-primary-foreground text-primary"
                >
                  <CheckIcon
                    className={small ? "size-2.5" : "size-3"}
                    strokeWidth={3}
                  />
                </motion.span>
              ) : active ? (
                <motion.span
                  key="percent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {Math.round(summary.percent)}%
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <div className={cn("overflow-hidden rounded-full bg-primary-foreground/20", small ? "mt-1 h-0.5" : "mt-1.5 h-1")}>
            <div
              className="h-full rounded-full bg-primary-foreground transition-[width] duration-300 ease-out"
              style={{ width: `${summary.percent}%` }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function FolderCaption({ fallback }: { fallback: React.ReactNode }) {
  const { uploader } = useUploadContext()
  const summary = useUploadProgress(uploader)
  if (summary.total === 0) {
    return <UploadDropzoneDescription>{fallback}</UploadDropzoneDescription>
  }
  return (
    <UploadDropzoneDescription className="tabular-nums">
      {summary.isComplete
        ? `${summary.counts.success} file${summary.counts.success === 1 ? "" : "s"} uploaded · ${formatBytes(summary.size)}`
        : summary.hasErrors
          ? `${summary.counts.error} failed · ${summary.counts.success} uploaded`
          : `Uploading ${formatBytes(summary.loaded)} of ${formatBytes(summary.size)}`}
    </UploadDropzoneDescription>
  )
}

export { FolderUpload, type FolderUploadProps }
