"use client";

// ============================================================================
// RMIS — HR recruitment list + job form (spec §7.10). Filterable, sortable,
// paginated postings table (10/page, 30 s silent poll). JobFormDialog handles
// create + edit: RICH description sections (Brief description, Other
// qualifications, Compensation package and Key Competency — sanitized HTML
// companions + tag-stripped plain columns, Task 26), qualification vitals
// (write-through to the position master), and publish/deadline/processing
// dates. (Task 26 — Duties & responsibilities is retired; drafts persist to
// localStorage across modal close / page reload and clear only on save.)
// QA 2026-02 — the form carries the full CSC posting identity: Plantilla Item
// No. (required for Plantilla types — 1:1 with the position), Salary Grade
// (SG-1…SG-33 combobox, free-typing allowed) and Monthly Salary (PHP), all
// write-through to the linked Position so every job board shows them.
// Task 32 — JobFormDialog carries the sign-in/sign-up look: bordered dialog
// card, auth header typography, icon-led fields with reserved error lines,
// blur-timed field errors, official StatefulButton submit.
// Save-as-later batch (user direction 2026-10) — the create dialog grows a
// "Save as later" action beside Create & publish: it POSTs status PENDING so
// the posting stays OFF the public board (staff-only workspace fact, §8.7)
// until published. The Jobs table's Status column carries the matching
// per-row publication dropdown (Published ⇄ Pending, portal dropdown — the
// table card's overflow clipping rules out the in-field motion Select), and
// the toolbar status filter learns the Pending / Published lenses.
// Task 24 (user direction) — Place of Assignment is RETIRED system-wide (the
// agency doesn't use one): the field left the form, the API and the Position
// master; the public board's location line now speaks the division full name
// (jobPlace) with the agency address as fallback. (Task 10-d earlier retired
// the Salary Step field — the board renders the SG grade alone when no step
// is stored.) The modal itself
// grows into an enterprise form frame: a wider card — max-w-5xl (1024px) on
// laptops, scaling to 80vw capped at 1440px from the 2xl breakpoint so wide
// desktop monitors get a proportionally larger dialog — with a sticky
// header (eyebrow + title + guidance) and sticky footer (contextual hint +
// actions) framing a scrollable body, and the panels in a two-column grid at
// lg — Position Details beside Compensation & Vacancy — so the whole posting
// fits one glance instead of an endless single column. Task 10-d — every
// field box is WHITE (bg-white on the Input/Textarea field wrappers) so the
// controls pop against the cloud FormPanel tint instead of melting into it.
// Identical for ADMIN and EVALUATOR: both roles create/edit through this one
// dialog (#/recruitment "New posting", #/job edit).
// Scalability 2026-10 — the four type-or-pick fields are STAFF-EXTENSIBLE:
// the Combobox panels grow an "Add …" row whenever typed text matches no
// choice; confirming it POSTs /api/options (EVALUATOR/ADMIN-gated), which
// stores the choice in the DropdownOption table (canonical dedup) so the
// vocabulary grows for every staff member with zero code changes. Base
// registries (lib/constants) still lead; added choices merge underneath.
// Task 11 (user direction) — the cross-job "Send interview invitations" bulk
// send moved OFF the Review Queue onto the per-posting surfaces. Task 13
// (user direction) — the Jobs-table per-row Video action is retired: the
// invitation send lives ONLY inside the Pipeline kanban's Shortlisted column
// of a specific job (job-workspace), which fans out to THAT posting's
// shortlist only. The table stays lean — no queue fetch, no composer here.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import {
  AlertTriangle, Banknote, Briefcase, CalendarClock, Check, ChevronDown, Clock, Eye, EyeOff, FileText, Globe, ListChecks,
  Pencil, Plus, Search, type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// BEUI Phase 8 — official Input (beui.dev/r/input, vendored at
// src/components/motion/input): label prop renders the field's own label,
// onChange receives the string, error drives the animated message line.
// Task 32 — the title/vacancy rules are derived on every render and revealed
// only once a field was left (onBlur) or the form submitted, clearing the
// moment it is fixed (useAuthErrors — the auth-exact contract).
import { Input } from "@/components/motion/input";
import { Combobox, type ComboboxOption } from "@/components/motion/combobox";
// Task 25/26 — the long-form fields (Key Competency, Brief description,
// Other qualifications, Compensation package) are rich editors
// (src/components/forms/rich-editor): toolbar formatting + sanitized HTML.
import { RichEditor } from "@/components/forms/rich-editor";
import { useAuthErrors } from "@/components/forms/field-errors";
import { StatefulButton } from "@/components/motion/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/motion/select";
import {
  EmptyState, IconChip, PageHeader, Pagination, RefreshButton, SkeletonRows, StatusPill, type ChipTone,
} from "@/components/ui/shell";
import { apiFetch, deadlineState, formatCurrency, formatDate } from "@/lib/client";
import type { JobWire } from "@/lib/router";
import { navigate } from "@/lib/router";
import { useFocusRefresh } from "@/lib/use-focus-refresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandLogo } from "@/components/brand-logo";
import { htmlToPlainText } from "@/lib/sanitize";
import { jobStatusView } from "@/lib/job-meta";
// BEUI Phase 5 — official virtualized Table (beui.dev/r/table, vendored
// verbatim at src/components/motion/table). RMIS alignment happens only
// through the block's sanctioned props (data/columns/cell renderers/heights).
import { Table, type TableColumn } from "@/components/motion/table";
import {
  CSC_EDUCATION_FIRST_LEVEL, CSC_EDUCATION_HIGHER_LEVEL, CSC_ELIGIBILITY_REGISTRY,
  DIVISIONS, POSITION_TYPES,
} from "@/lib/constants";
import {
  canonicalOptionValue,
  type DropdownField,
  type DropdownOptionWire,
  type DropdownVocabulary,
} from "@/lib/dropdown-options";

// ── Shared visuals ──────────────────────────────────────────────────────────

// Canonical button classes now live in @/components/ui/buttons; these
// re-exports keep existing import paths stable.
export { ghostBtn, ctaBtn, ghostBadBtn, iconBtn, iconBtnBad } from "@/components/ui/buttons";
import { ghostBtn, ctaBtn, ghostBadBtn, iconBtn, iconBtnBad } from "@/components/ui/buttons";
import { cn } from "@/lib/utils";

/**
 * Bevel dialog sub-panel: cloud-tint 16px nested surface with an ink heading —
 * used inside the white job-form dialog instead of bordered cards.
 */
function FormPanel({
  title,
  icon,
  chipTone = "slate",
  children,
}: {
  title: string;
  icon: LucideIcon;
  chipTone?: ChipTone;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-cloud/60 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <IconChip icon={icon} tone={chipTone} size={32} iconSize={15} />
        <h3 className="text-sm font-medium text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function isOpenJob(j: JobWire): boolean {
  return j.isActive && !deadlineState(j.deadlineDate).overdue;
}

/** Job posting status pill — THE system badge. Speaks the deadline ladder
    (jobStatusView, lib/job-meta) so the Jobs table, the job workspace header
    AND the Job Opportunities board render one identical status story:
    Closed (red) → Closing today / Closing in N days (amber) → N days left /
    Open until filled (gray) → Open (green). Previously this pill showed a
    binary Open/Closed that disagreed with the ladder the rest of the system
    speaks. */
export function JobStatusPill({ job }: { job: JobWire }) {
  const view = jobStatusView(job);
  return <StatusPill status={view.label} variant={view.variant} />;
}

/** Per-row publication dropdown — the Jobs table's status dropdown. Shows the
    posting's current publication state and PATCHes /api/jobs/[id] { status }
    to flip it either way (the jobCreateSchema.status contract). This is the
    publish path for Save-as-later drafts, and the unpublish path when a live
    posting must come off the board. Portal-based DropdownMenu because the
    table card's overflow-hidden/overflow-auto wrappers would clip an
    absolutely-positioned select panel. The deadline-ladder pill renders
    beside/below it only for PUBLISHED rows — a "Closing in 3 days" badge on a
    posting that is not even on the board would read as a contradiction.
    Task 62 (user: the old white box + two plain rows read too simple) — the
    trigger now SPEAKS the state like the rest of the system's badges: a tinted
    control (ok-green wash + dot when Published, amber wash when Pending)
    instead of a flat white field. The panel grew into an icon-led choice
    list: a "Publication" eyebrow label, each option as a tone icon chip
    (Globe = live on the board, EyeOff = hidden from it) beside a stacked
    title/description pair — no more side-caption wrapping into three ragged
    lines — and the live state closes with a check in its tone color. Clicking
    the active row is a safe no-op (onStatusChange guards same-status). */
function PublicationDropdown({
  job,
  compact,
  onChange,
}: {
  job: JobWire;
  /** Mobile cell — 28px trigger, 11px label (the 140px column is tight). */
  compact?: boolean;
  onChange: (job: JobWire, status: "PENDING" | "PUBLISHED") => void;
}) {
  const pending = job.status === "PENDING";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-ring inline-flex w-full max-w-[140px] items-center justify-between gap-1.5 rounded-lg border font-medium text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          pending
            ? "border-warn/40 bg-warn-bg/70 hover:bg-warn-bg"
            : "border-ok/30 bg-ok-bg/70 hover:bg-ok-bg",
          compact ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs",
        )}
        aria-label={`Publication status: ${pending ? "Pending" : "Published"} — change for ${job.title}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", pending ? "bg-warn" : "bg-ok")}
          />
          <span className="truncate">{pending ? "Pending" : "Published"}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Publication</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => onChange(job, "PUBLISHED")}
          className="items-start gap-2.5 py-2.5"
        >
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg",
              pending ? "bg-cloud text-stone" : "bg-ok-bg text-ok",
            )}
          >
            <Globe className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-medium leading-none text-ink">Published</span>
            <span className="text-[11px] leading-snug text-stone">Live on the public job board</span>
          </span>
          {!pending && <Check className="ml-auto size-4 shrink-0 text-ok" aria-hidden />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange(job, "PENDING")}
          className="items-start gap-2.5 py-2.5"
        >
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg",
              pending ? "bg-warn-bg text-warn" : "bg-cloud text-stone",
            )}
          >
            <EyeOff className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-medium leading-none text-ink">Pending</span>
            <span className="text-[11px] leading-snug text-stone">Hidden from the job board</span>
          </span>
          {pending && <Check className="ml-auto size-4 shrink-0 text-warn" aria-hidden />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Job form dialog (create + edit) — named export, reused by job-workspace ─

export function JobFormDialog({
  open,
  onOpenChange,
  job,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job?: JobWire | null;
  onSaved: () => void;
}) {
  const editing = job != null;
  const [title, setTitle] = useState("");
  const [positionType, setPositionType] = useState("");
  const [itemNumber, setItemNumber] = useState("");
  const [salaryGrade, setSalaryGrade] = useState("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [vacancy, setVacancy] = useState("1");
  const [division, setDivision] = useState("");
  // Task 25 — organizational Section (sits under Division on the form and the
  // posting page) and the Key Competency rich-editor HTML.
  const [section, setSection] = useState("");
  const [keyCompetency, setKeyCompetency] = useState("");
  const [education, setEducation] = useState("");
  const [experience, setExperience] = useState("");
  const [training, setTraining] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [license, setLicense] = useState("");
  const [brief, setBrief] = useState("");
  const [compensation, setCompensation] = useState("");
  const [otherQuals, setOtherQuals] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [processingDate, setProcessingDate] = useState("");
  // Save-as-later batch — the dialog has two submit actions in create mode
  // (Create & publish → PUBLISHED, Save as later → PENDING) plus the edit
  // save. busyMode records WHICH action is mid-flight so only that button
  // shows the loading state and the others disable while it runs.
  const [busyMode, setBusyMode] = useState<null | "publish" | "later" | "edit">(null);
  const busy = busyMode !== null;

  // Scalability 2026-10 — staff-extensible dropdown vocabulary: choices added
  // through the panels' "Add" input persist server-side (DropdownOption
  // table); this dialog loads them each time it opens and merges them under
  // the base registries, so every staff member sees the same growing vocab.
  const [dyna, setDyna] = useState<DropdownVocabulary>({
    positionType: [],
    division: [],
    cscEducation: [],
    cscEligibility: [],
  });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<DropdownVocabulary>("/api/options")
      .then((v) => {
        if (!cancelled) setDyna(v);
      })
      .catch(() => {
        /* base registries still render; adding a choice still works */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** "Add \"…\"" handler — persists the typed choice (canonical dedup
      server-side; re-adding under any casing returns the stored row) and
      returns it so the Combobox selects it like a picked option. */
  const addChoice = async (
    field: DropdownField,
    raw: string,
  ): Promise<ComboboxOption | undefined> => {
    // Division nicety: typing an official division NAME stores its code,
    // exactly what picking the row would have stored.
    let value = raw;
    if (field === "division") {
      const hit = DIVISIONS.find((d) => d.name.toLowerCase() === raw.toLowerCase());
      if (hit) value = hit.code;
    }
    try {
      const res = await apiFetch<{ option: DropdownOptionWire; created: boolean }>(
        "/api/options",
        { method: "POST", body: { field, value } },
      );
      setDyna((prev) => {
        const list = prev[field] ?? [];
        if (list.some((o) => o.value === res.option.value)) return prev;
        const next = { ...prev } as DropdownVocabulary;
        next[field] = [...list, res.option];
        return next;
      });
      toast.success(
        res.created
          ? `Choice added — “${res.option.value}” is now available to all staff`
          : `“${res.option.value}” is already one of the choices`,
      );
      return res.option;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the choice");
      return undefined; // panel stays open; the choice can be retried
    }
  };

  /** Base registry first, staff-added choices underneath — deduped
      canonically so a choice that mirrors a base entry never mounts twice. */
  const mergeVocab = (
    base: { value: string; label: string; hint?: string }[],
    added?: DropdownOptionWire[],
  ) => {
    if (!added || added.length === 0) return base;
    const seen = new Set(base.map((o) => canonicalOptionValue(o.value)));
    const extra = added.filter(
      (o) => o.value.trim() !== "" && !seen.has(canonicalOptionValue(o.value)),
    );
    return extra.length === 0 ? base : [...base, ...extra];
  };

  const positionTypeOptions = mergeVocab(
    POSITION_TYPES.map((t) => ({ value: t, label: t })),
    dyna.positionType,
  );
  const divisionOptions = mergeVocab(
    DIVISIONS.map((d) => ({ value: d.code, label: d.code, hint: d.name })),
    dyna.division,
  );
  const educationOptions = mergeVocab(
    [...CSC_EDUCATION_FIRST_LEVEL, ...CSC_EDUCATION_HIGHER_LEVEL].map((t) => ({
      value: t,
      label: t,
    })),
    dyna.cscEducation,
  );
  const eligibilityOptions = mergeVocab(
    CSC_ELIGIBILITY_REGISTRY.map((r) => ({ value: r.name, label: r.name, hint: r.description })),
    dyna.cscEligibility,
  );
  // QA 2026-02 — CSC salary schedule grades; the stored value is the bare
  // grade number (display surfaces render it as SG-19). Free typing is kept
  // so future schedules or non-standard grades still work.
  const salaryGradeOptions = Array.from({ length: 33 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
    hint: `SG-${i + 1}`,
  }));

  // Task 32 — auth-exact error timing (useAuthErrors): the rules map is
  // derived on EVERY render (an error clears the moment its field is fixed);
  // `shown` reveals a rule only once its field was left (onBlur) or the form
  // was submitted. Messages/logic are exactly what the submit computed in
  // Task 31; the vacancy parse runs here once and feeds the payload too.
  // QA 2026-02: vacancy count is required for contractual postings (COS and
  // Job Order alike); Plantilla positions map 1:1 to a Plantilla Item Number,
  // so the count is optional there and the ITEM NUMBER is what is required.
  const typeUpper = (positionType ?? "").toUpperCase();
  const isCos =
    typeUpper.includes("COS") || typeUpper.includes("CONTRACT") || typeUpper.includes("JOB ORDER");
  const isPlantilla = !isCos && typeUpper !== "";
  let vacancyNum: number | null = null;
  let vacancyRule: string | undefined;
  if (vacancy.trim() !== "") {
    const n = Number(vacancy);
    if (!Number.isInteger(n) || n < 1) {
      vacancyRule = "Vacancies must be a whole number of at least 1";
    } else {
      vacancyNum = n;
    }
  } else if (isCos) {
    vacancyRule = "Contract of Service / Job Order postings must specify the number of vacancies";
  }
  let salaryAmountNum: number | null | undefined;
  if (salaryAmount.trim() === "") {
    salaryAmountNum = undefined;
  } else {
    const n = Number(salaryAmount);
    salaryAmountNum = Number.isFinite(n) && n >= 0 ? n : null;
  }
  const rules = {
    title: !title.trim() ? "Title is required" : undefined,
    vacancy: vacancyRule,
    itemNumber:
      isPlantilla && !itemNumber.trim()
        ? "Plantilla postings need the Plantilla Item No."
        : undefined,
    salaryAmount:
      salaryAmountNum === null ? "Monthly salary must be a positive amount" : undefined,
  };
  const { shown, touch, touchAll, reset } = useAuthErrors(rules);

  // Task 26 — draft continuity: everything the user types persists to
  // localStorage (debounced) under a per-form key, so closing the modal or
  // reloading the page never wipes their input. The draft is restored on
  // open and cleared ONLY by a successful save.
  const draftKey = editing ? `rmis-jobform-draft:job-${job.id}` : "rmis-jobform-draft:new";

  const prefill = useCallback(() => {
    reset();
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
        setTitle(str("title"));
        setPositionType(str("positionType"));
        setItemNumber(str("itemNumber"));
        setSalaryGrade(str("salaryGrade"));
        setSalaryAmount(str("salaryAmount"));
        setVacancy(str("vacancy") || "1");
        setDivision(str("division"));
        setSection(str("section"));
        setKeyCompetency(str("keyCompetency"));
        setEducation(str("education"));
        setExperience(str("experience"));
        setTraining(str("training"));
        setEligibility(str("eligibility"));
        setLicense(str("license"));
        setBrief(str("brief"));
        setCompensation(str("compensation"));
        setOtherQuals(str("otherQuals"));
        setPublishDate(str("publishDate"));
        setDeadlineDate(str("deadlineDate"));
        setProcessingDate(str("processingDate"));
        return;
      }
    } catch {
      /* unreadable draft — fall through to the defaults */
    }
    if (!job) {
      setTitle("");
      setPositionType("");
      setItemNumber("");
      setSalaryGrade("");
      setSalaryAmount("");
      setVacancy("1");
      setDivision("");
      setSection("");
      setKeyCompetency("");
      setEducation("");
      setExperience("");
      setTraining("");
      setEligibility("");
      setLicense("");
      setBrief("");
      setCompensation("");
      setOtherQuals("");
      setPublishDate(new Date().toISOString().slice(0, 10));
      setDeadlineDate("");
      setProcessingDate("");
      return;
    }
    setTitle(job.title ?? "");
    setPositionType(job.positionType ?? "");
    setItemNumber(job.position?.itemNumber ?? "");
    setSalaryGrade(job.position?.salaryGrade ?? "");
    setSalaryAmount(job.position?.salaryAmount == null ? "" : String(job.position.salaryAmount));
    setVacancy(job.numberOfVacancy == null ? "" : String(job.numberOfVacancy));
    setDivision(job.position?.division ?? "");
    setSection(job.position?.section ?? "");
    setKeyCompetency(job.position?.keyCompetency ?? "");
    setEducation(job.position?.cscEducation ?? "");
    setExperience(job.position?.cscWorkExperience ?? "");
    setTraining(job.position?.cscTraining ?? "");
    setEligibility(job.position?.cscEligibilityGroup ?? job.position?.cscEligibility ?? "");
    setLicense(job.position?.license ?? "");
    setBrief(job.briefDescriptionHtml || job.briefDescription || "");
    setCompensation(job.compensationHtml || job.compensationPackage || "");
    setOtherQuals(job.otherQualificationsHtml || job.otherQualifications || "");
    setPublishDate(job.publishDate ? job.publishDate.slice(0, 10) : "");
    setDeadlineDate(job.deadlineDate ? job.deadlineDate.slice(0, 10) : "");
    setProcessingDate(job.processingDate ? job.processingDate.slice(0, 10) : "");
  }, [job, reset, draftKey]);

  useEffect(() => {
    if (open) prefill();
  }, [open, prefill]);

  // Debounced draft write — every field change lands in localStorage 300ms
  // after the last keystroke (fires only while the dialog is open).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            title, positionType, itemNumber, salaryGrade, salaryAmount,
            vacancy, division, section, keyCompetency, education, experience,
            training, eligibility, license, brief, compensation, otherQuals,
            publishDate, deadlineDate, processingDate,
          }),
        );
      } catch {
        /* storage unavailable — the form still works, just without drafts */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [
    open, draftKey, title, positionType, itemNumber, salaryGrade, salaryAmount,
    vacancy, division, section, keyCompetency, education, experience, training,
    eligibility, license, brief, compensation, otherQuals,
    publishDate, deadlineDate, processingDate,
  ]);

  // Task 70 — optional fields serialize as explicit null when cleared, never
  // undefined: JSON.stringify drops undefined keys, so an emptied field used
  // to vanish from the PATCH body and the server read its absence as "don't
  // touch" — deleting the Key Competency (and every other optional field)
  // silently survived "Save Changes". null = "clear it", absent = untouched.
  const opt = (v: string) => {
    const t = v.trim();
    return t === "" ? null : t;
  };

  const submit = async (mode: "publish" | "later" | "edit") => {
    touchAll();
    if (Object.values(rules).some(Boolean)) return;

    setBusyMode(mode);
    try {
      const body = {
        title: title.trim(),
        positionType: opt(positionType),
        itemNumber: opt(itemNumber),
        salaryGrade: opt(salaryGrade),
        salaryAmount: salaryAmountNum ?? null,
        numberOfVacancy: vacancyNum,
        division: opt(division),
        section: opt(section),
        education: opt(education),
        experience: opt(experience),
        training: opt(training),
        eligibility: opt(eligibility),
        license: opt(license),
        // Task 26 — the description fields are rich editors: the sanitized
        // HTML companion carries the formatting; the plain column gets the
        // tag-stripped text that card snippets and plain labels render.
        // Task 70 — all of these are clearable: empty must reach the server
        // as null (see opt above), or the PATCH would keep the old value.
        briefDescription: htmlToPlainText(brief) || null,
        briefDescriptionHtml: brief || null,
        compensationPackage: htmlToPlainText(compensation) || null,
        compensationHtml: compensation || null,
        otherQualifications: htmlToPlainText(otherQuals) || null,
        otherQualificationsHtml: otherQuals || null,
        keyCompetency: keyCompetency || null,
        publishDate: publishDate || null,
        deadlineDate: deadlineDate || null,
        processingDate: processingDate || null,
        // Save-as-later batch — create carries the publication decision
        // (Create & publish → PUBLISHED, Save as later → PENDING); edits
        // never touch status (the table dropdown owns that flip).
        status: editing ? undefined : mode === "later" ? ("PENDING" as const) : ("PUBLISHED" as const),
      };
      if (editing) {
        await apiFetch(`/api/jobs/${job.id}`, { method: "PATCH", body });
        toast.success("Job posting updated");
      } else if (mode === "later") {
        await apiFetch("/api/jobs", { method: "POST", body });
        toast.success("Job posting saved as pending", {
          description: "It stays off the public job board until you publish it from the jobs table.",
        });
      } else {
        await apiFetch("/api/jobs", { method: "POST", body });
        toast.success("Job posting created and published");
      }
      // Task 26 — the draft has been fulfilled; clear it so the next open
      // prefills from the saved record instead of the stale scratchpad.
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* non-fatal */
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the job posting");
    } finally {
      setBusyMode(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Task 10 — enterprise form frame: a wider card structured as
          a pinned header (eyebrow + title + guidance) over a scrollable body
          over a pinned footer (contextual hint + actions). Header and footer
          never scroll away, so guidance and the save action stay on screen
          for the whole fill — the panels read in a two-column grid at lg.
          Task 10-b — width tiers with the screen: 1024px from sm (laptop
          sweet spot), then 80vw capped at 1440px from 2xl so wide desktop
          monitors get a proportionally larger frame instead of a fixed card
          floating in space. */}
      <DialogContent
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-3xl border border-border bg-white p-0 sm:max-w-5xl 2xl:w-[80vw] 2xl:max-w-[90rem]"
        ariaLabel={editing ? "Edit job posting" : "Create job posting"}
      >
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/70 bg-white px-5 pb-4 pr-14 pt-5 text-left sm:px-6 sm:pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-metric-blue">
            {editing ? "Edit posting" : "New posting"}
          </p>
          <DialogTitle className="text-xl font-medium text-foreground">
            {editing ? "Edit job posting" : "Create job posting"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {editing
              ? "Updates are saved to the posting; qualification vitals write through to the position master."
              : "Create & publish puts the posting on the job board immediately; Save as later keeps it pending (off the board) until you publish it from the jobs table. Qualification vitals create or update the linked position."}{" "}
            The form carries every fact the public job board shows — fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body — identity + pay panels sit side by side at lg. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-thin px-5 py-5 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <FormPanel title="Position Details" icon={Briefcase} chipTone="slate">
              <div className="space-y-4">
                <Input
                  id="job-title"
                  label="Title *"
                  value={title}
                  maxLength={200}
                  onChange={setTitle}
                  onBlur={() => touch("title")}
                  placeholder="e.g. Science Research Specialist I"
                  leftIcon={<Briefcase />}
                  classNames={{ field: "bg-white" }}
                  error={shown("title")}
                  reserveErrorLine
                />

                {/* Type-or-pick fields — official Combobox (the select family
                    with typing), the same dropdown UI the applicant profile
                    forms use; no native datalist anywhere. Each panel carries
                    an "Add …" row: confirming it stores the typed choice
                    server-side (/api/options) so the vocabulary grows for all
                    staff without a code change. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Combobox
                    id="job-type"
                    label="Position type"
                    value={positionType}
                    onValueChange={(next) => setPositionType(next)}
                    options={positionTypeOptions}
                    placeholder="Select or type"
                    triggerClassName="h-11 bg-white"
                    onAddOption={(raw) => addChoice("positionType", raw)}
                  />

                  <Combobox
                    id="job-division"
                    label="Division"
                    value={division}
                    onValueChange={(next) => setDivision(next)}
                    options={divisionOptions}
                    placeholder="Official code or custom"
                    triggerClassName="h-11 bg-white"
                    onAddOption={(raw) => addChoice("division", raw)}
                  />
                </div>

                {/* QA 2026-02 — Plantilla identity. A Plantilla position maps
                    1:1 to its Plantilla Item No. (required for
                    Permanent/Temporary types); COS / Job Order postings may
                    have none. Task 24 — the old Place-of-assignment Combobox
                    that sat beside it is retired system-wide. Task 25 — the
                    right-hand slot below Division now holds the organizational
                    Section. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Input
                      id="job-item-number"
                      label={`Item No. (Plantilla)${isPlantilla ? " *" : ""}`}
                      value={itemNumber}
                      maxLength={60}
                      onChange={setItemNumber}
                      onBlur={() => touch("itemNumber")}
                      placeholder="e.g. MIRDC-OSDS-SSRS-1-2026"
                      classNames={{ field: "bg-white" }}
                      error={shown("itemNumber")}
                      reserveErrorLine
                    />
                    {!shown("itemNumber") && (
                      <p className="px-1 text-xs text-stone">
                        Plantilla positions carry one unique item number; Contract of Service / Job Order postings may leave this empty.
                      </p>
                    )}
                  </div>
                  <Input
                    id="job-section"
                    label="Section"
                    value={section}
                    maxLength={100}
                    onChange={setSection}
                    placeholder="e.g. Metrology Section"
                    classNames={{ field: "bg-white" }}
                  />
                </div>

                <div className="space-y-4 rounded-lg bg-white/70 p-4">
                  <p className="text-xs font-medium text-stone">Qualification vitals (write-through to the position master)</p>
                  <Combobox
                    id="job-education"
                    label="Education (CSC standard)"
                    value={education}
                    onValueChange={(next) => setEducation(next)}
                    options={educationOptions}
                    placeholder="Select from CSC MC 07 options or type"
                    triggerClassName="h-11 bg-white"
                    onAddOption={(raw) => addChoice("cscEducation", raw)}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="job-experience"
                      label="Experience"
                      value={experience}
                      maxLength={500}
                      onChange={(next) => setExperience(next)}
                      placeholder='e.g. 1 year of relevant experience'
                      classNames={{ field: "bg-white" }}
                      reserveErrorLine
                    />
                    <Input
                      id="job-training"
                      label="Training"
                      value={training}
                      maxLength={500}
                      onChange={(next) => setTraining(next)}
                      placeholder='e.g. 8 hours of relevant training'
                      classNames={{ field: "bg-white" }}
                      reserveErrorLine
                    />
                  </div>
                  <Combobox
                    id="job-eligibility"
                    label="Eligibility"
                    value={eligibility}
                    onValueChange={(next) => setEligibility(next)}
                    options={eligibilityOptions}
                    placeholder="CSC registry entry or custom"
                    triggerClassName="h-11 bg-white"
                    onAddOption={(raw) => addChoice("cscEligibility", raw)}
                  />
                  <Input
                    id="job-license"
                    label="License / special skill"
                    value={license}
                    maxLength={500}
                    onChange={(next) => setLicense(next)}
                    classNames={{ field: "bg-white" }}
                    reserveErrorLine
                  />
                </div>
              </div>
            </FormPanel>

            <FormPanel title="Compensation & Vacancy" icon={Banknote} chipTone="amber">
              <div className="space-y-4">
                {/* QA 2026-02 — the posting's pay identity: Salary Grade
                    (CSC schedule, free-typing allowed) and the Monthly Salary
                    it carries; both write through to the linked Position so
                    every board, detail pane, and the jobs table render them.
                    Task 10-d — Salary Step retired from the form per feedback
                    (the SG grade dropdown + monthly salary carry the pay
                    story); boards render "SG 19" when no step is stored, and
                    legacy step values keep rendering where present. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Combobox
                    id="job-salary-grade"
                    label="Salary Grade"
                    value={salaryGrade}
                    onValueChange={(next) => setSalaryGrade(next)}
                    options={salaryGradeOptions}
                    placeholder="Select or type (e.g. 19)"
                    triggerClassName="h-11 bg-white"
                  />
                  <div className="space-y-1.5">
                    <Input
                      id="job-salary-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      label="Monthly salary (PHP)"
                      value={salaryAmount}
                      onChange={setSalaryAmount}
                      onBlur={() => touch("salaryAmount")}
                      placeholder="e.g. 51367.00"
                      classNames={{ field: "bg-white" }}
                      error={shown("salaryAmount")}
                      reserveErrorLine
                    />
                    {!shown("salaryAmount") && (
                      <p className="px-1 text-xs text-stone">Shown as the posting's Monthly Salary everywhere.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Input
                    id="job-vacancy"
                    type="number"
                    min={1}
                    max={99}
                    label={`Number of vacancies${isCos ? " *" : ""}`}
                    value={vacancy}
                    onChange={setVacancy}
                    onBlur={() => touch("vacancy")}
                    classNames={{ field: "bg-white" }}
                    error={shown("vacancy")}
                    reserveErrorLine
                  />
                  {!shown("vacancy") && (
                    <p className="px-1 text-xs text-stone">Required for Contract of Service / Job Order postings. Plantilla positions map 1:1 to a Plantilla Item No., so the count is optional.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  {/* Task 26 — rich editor: the package carries formatting; the
                      plain column gets the tag-stripped text for the facts. */}
                  <RichEditor
                    id="job-compensation"
                    label="Compensation package"
                    value={compensation}
                    onChange={setCompensation}
                    placeholder="e.g. SG-22 Step 1 monthly salary plus statutory benefits."
                    classNames={{ field: "bg-white" }}
                  />
                  <p className="px-1 text-xs text-stone">Rendered as the Compensation section on the public posting page.</p>
                </div>
              </div>
            </FormPanel>
          </div>

          {/* Task 10 — each description field carries its front-page mapping
              so it's obvious what the applicant will see where. Task 26 — the
              fields are RICH EDITORS now (the plain columns carry the
              tag-stripped text); Duties & responsibilities is retired. */}
          <FormPanel title="Posting Description" icon={FileText} chipTone="plum">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <RichEditor
                  id="job-brief"
                  label="Brief description"
                  value={brief}
                  onChange={setBrief}
                  placeholder="One short pitch — this is the snippet applicants see on the job cards."
                  classNames={{ field: "bg-white", pane: "min-h-[120px]" }}
                />
                <p className="px-1 text-xs text-stone">The snippet applicants see on the public job cards and posting header.</p>
              </div>
              <div className="space-y-1.5">
                <RichEditor
                  id="job-quals"
                  label="Other qualifications"
                  value={otherQuals}
                  onChange={setOtherQuals}
                  placeholder="e.g. TESDA NC II holders encouraged to apply."
                  classNames={{ field: "bg-white", pane: "min-h-[120px]" }}
                />
                <p className="px-1 text-xs text-stone">Rendered as the Qualifications section on the public posting page.</p>
              </div>
            </div>
          </FormPanel>

          {/* Task 25 — Key Competency: a true rich-text field. The contents run
              a full page long, so the editor pane is a page-tall scrollable
              surface with bold/italic/underline/lists; the HTML is sanitized
              server-side (spec §12.4) before it reaches the Position master. */}
          {/* Task 66 — the panel title IS the visible label, so the field's own
              label is screen-reader-only: no duplicated "Key Competency" row
              between the header and the toolbar, while the <label htmlFor>
              → editor association (and the pane's accessible name) survive. */}
          <FormPanel title="Key Competency" icon={ListChecks} chipTone="emerald">
            <div className="space-y-1.5">
              <RichEditor
                id="job-key-competency"
                label="Key Competency"
                value={keyCompetency}
                onChange={setKeyCompetency}
                placeholder="Lay out the key competencies for this position — use bold, italics, underline and lists as needed."
                classNames={{ field: "bg-white", label: "sr-only" }}
              />
              <p className="px-1 text-xs text-stone">
                Rendered as the Key Competency section on the public posting page.
              </p>
            </div>
          </FormPanel>

          <FormPanel title="Publishing" icon={CalendarClock} chipTone="gold">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input id="job-publish" type="date" label="Publish date" value={publishDate} onChange={(next) => setPublishDate(next)} classNames={{ field: "bg-white" }} reserveErrorLine />
              <Input id="job-deadline" type="date" label="Deadline" value={deadlineDate} onChange={(next) => setDeadlineDate(next)} classNames={{ field: "bg-white" }} reserveErrorLine />
              <Input id="job-processing" type="date" label="Processing date" value={processingDate} onChange={(next) => setProcessingDate(next)} classNames={{ field: "bg-white" }} reserveErrorLine />
            </div>
          </FormPanel>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center gap-3 border-t border-border/70 bg-white px-5 py-4 sm:px-6">
          <p className="mr-auto hidden min-w-0 truncate text-xs text-stone sm:block">
            {editing
              ? "Changes save to the posting and its linked position."
              : "Create & publish goes live immediately — Save as later keeps it off the board."}
          </p>
          <button type="button" className={ghostBtn} disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          {/* Save-as-later batch — the secondary create action: the posting is
              stored as PENDING (hidden from the public board per §8.7) and
              surfaces in the Jobs table, whose per-row publication dropdown
              publishes it later. */}
          {!editing && (
            <button
              type="button"
              className={ghostBtn}
              disabled={busy}
              onClick={() => void submit("later")}
            >
              {busyMode === "later" ? "Saving…" : "Save as later"}
            </button>
          )}
          {/* Task 32 — official StatefulButton lifecycle; never disabled for
              validation gaps (busy/loading only). */}
          <StatefulButton
            type="button"
            size="md"
            state={busyMode === "publish" || busyMode === "edit" ? "loading" : "idle"}
            loadingText="Saving"
            className="min-h-[44px] px-5 py-2.5"
            onClick={() => void submit(editing ? "edit" : "publish")}
          >
            {editing ? "Save changes" : "Create & publish"}
          </StatefulButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Recruitment list ────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function Recruitment() {
  const [jobs, setJobs] = useState<JobWire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "closed" | "pending" | "published"
  >("all");
  const [sortBy, setSortBy] = useState<"recent" | "deadline" | "applications">("recent");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editJob, setEditJob] = useState<JobWire | null>(null);
  const openCreate = () => {
    setEditJob(null);
    setFormOpen(true);
  };
  const openEdit = (j: JobWire) => {
    setEditJob(j);
    setFormOpen(true);
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const data = await apiFetch<JobWire[]>("/api/jobs?limit=200");
      setJobs(data);
      // BEUI Phase 7 — snapshot server truth per row so a failed inline
      // vacancy edit can revert precisely (see onVacancyEdit below).
      for (const j of data) vacancyServer.current.set(String(j.id), j.numberOfVacancy ?? null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load job postings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // BEUI Phase 7 — Editable contract (beui.dev/r/table-editable): the
  // Vacancies column is inline-editable via the official `editable` column
  // flag + the block's onCellEdit. The official EditableCell is a controlled
  // input fed from row data, so each keystroke optimistic-writes into state
  // and a settle timer PATCHes it through; the server response re-asserts
  // truth only if no newer draft arrived mid-flight, and failures revert to
  // the last server value. Pending timers are left to self-complete on
  // unmount (React 18 no-ops their state writes) so quick navigations never
  // silently drop an edit.
  const vacancySeq = useRef<Map<string, number>>(new Map());
  const vacancyTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const vacancyServer = useRef<Map<string, number | null>>(new Map());

  const onVacancyEdit = useCallback((rowId: string, columnKey: string, value: string) => {
    if (columnKey !== "numberOfVacancy") return;
    // Digits-only intermediate state; the API range is int 1..99, nullable
    // for plantilla posts.
    const cleaned = value.replace(/[^0-9]/g, "").slice(0, 2);
    const next: number | null = cleaned === "" ? null : Math.min(99, Number.parseInt(cleaned, 10));
    const job = jobs?.find((j) => String(j.id) === rowId);
    const typeUpper = (job?.positionType ?? "").toUpperCase();
    if (next == null && (typeUpper.includes("COS") || typeUpper.includes("CONTRACT"))) {
      // Mirrors the server's POST invariant + the JobFormDialog rule.
      toast.warning("COS postings must specify the number of vacancies");
      setJobs((cur) =>
        cur
          ? cur.map((j) => (String(j.id) === rowId ? { ...j, numberOfVacancy: vacancyServer.current.get(rowId) ?? null } : j))
          : cur,
      );
      return;
    }
    vacancySeq.current.set(rowId, (vacancySeq.current.get(rowId) ?? 0) + 1);
    setJobs((cur) =>
      cur ? cur.map((j) => (String(j.id) === rowId ? { ...j, numberOfVacancy: next } : j)) : cur,
    );
    const timers = vacancyTimers.current;
    const pending = timers.get(rowId);
    if (pending) clearTimeout(pending);
    const seq = vacancySeq.current.get(rowId) ?? 0;
    timers.set(
      rowId,
      setTimeout(() => {
        timers.delete(rowId);
        void (async () => {
          try {
            const updated = await apiFetch<JobWire>(`/api/jobs/${rowId}`, {
              method: "PATCH",
              body: { numberOfVacancy: next },
            });
            vacancyServer.current.set(rowId, updated.numberOfVacancy ?? null);
            if (vacancySeq.current.get(rowId) === seq) {
              // No newer keystroke raced the request — take server truth.
              vacancySeq.current.delete(rowId);
              setJobs((cur) =>
                cur
                  ? cur.map((j) => (String(j.id) === rowId ? { ...j, numberOfVacancy: updated.numberOfVacancy } : j))
                  : cur,
              );
              toast.success("Vacancies updated");
            }
          } catch (e) {
            vacancySeq.current.delete(rowId);
            toast.error(e instanceof Error ? e.message : "Couldn't update vacancies");
            setJobs((cur) =>
              cur
                ? cur.map((j) => (String(j.id) === rowId ? { ...j, numberOfVacancy: vacancyServer.current.get(rowId) ?? null } : j))
                : cur,
            );
          }
        })();
      }, 500),
    );
  }, [jobs]);

  // Save-as-later batch — the per-row publication dropdown's handler:
  // optimistic flip (same contract as the inline vacancy edit above),
  // server re-assert on success, revert + toast on failure.
  const onStatusChange = useCallback(
    async (job: JobWire, status: "PENDING" | "PUBLISHED") => {
      if (job.status === status) return;
      setJobs((cur) =>
        cur ? cur.map((j) => (j.id === job.id ? { ...j, status } : j)) : cur,
      );
      try {
        await apiFetch(`/api/jobs/${job.id}`, { method: "PATCH", body: { status } });
        toast.success(
          status === "PUBLISHED" ? "Job posting published" : "Job posting moved to pending",
          {
            description:
              status === "PUBLISHED"
                ? "It is now live on the public job board."
                : "It is now hidden from the public job board until published.",
          },
        );
        void load(true); // re-assert server truth silently
      } catch (e) {
        setJobs((cur) =>
          cur ? cur.map((j) => (j.id === job.id ? { ...j, status: job.status } : j)) : cur,
        );
        toast.error(e instanceof Error ? e.message : "Couldn't update the publication status");
      }
    },
    [load],
  );

  // 30 s silent poll + refetch-on-focus (spec §13).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);
  useFocusRefresh(load);

  // Debounced search (350 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    let rows = jobs ?? [];
    if (debouncedSearch) {
      rows = rows.filter((j) => {
        const hay = [
          j.title,
          j.position?.itemNumber,
          j.positionType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(debouncedSearch);
      });
    }
    if (statusFilter === "open") rows = rows.filter((j) => j.status === "PUBLISHED" && isOpenJob(j));
    else if (statusFilter === "closed") rows = rows.filter((j) => j.status === "PUBLISHED" && !isOpenJob(j));
    else if (statusFilter === "pending") rows = rows.filter((j) => j.status === "PENDING");
    else if (statusFilter === "published") rows = rows.filter((j) => j.status === "PUBLISHED");
    const sorted = [...rows];
    if (sortBy === "recent") {
      sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    } else if (sortBy === "deadline") {
      sorted.sort((a, b) => {
        const av = a.deadlineDate ? new Date(a.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.deadlineDate ? new Date(b.deadlineDate).getTime() : Number.POSITIVE_INFINITY;
        return av - bv;
      });
    } else {
      sorted.sort((a, b) => b.applicationCount - a.applicationCount);
    }
    return sorted;
  }, [jobs, debouncedSearch, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // BEUI Phase 5/7 — column defs for the official Table. Row navigation lives
  // in the Position cell (the block has no row-click prop); quick actions are
  // always visible now that rows are virtualized (no group/row hover stage).
  // Phase 7: Vacancies dropped its custom cell and set `editable` so the
  // block's own EditableCell renders (cell renderers suppress it by design).
  // QA 2026-02 fix — Position is flexible (no declared width) and the fixed
  // widths sum to 700px, so the table fits the 960px card at the default
  // 1280×720 viewport (the old 1120px sum forced a horizontal overflow that
  // pushed the quick actions outside the viewport).
  const ROW_H = 64;
  // Task 81-b — the View/Edit icon pair below is byte-identical at BOTH
  // breakpoints (only the cell wrapper's gap and the column width differ), so
  // it is defined once and each cell keeps its own wrapper. Visual output
  // unchanged: phones keep gap-1/98px, sm+ keeps gap-1.5/110px.
  const jobQuickActions = (j: JobWire) => (
    <>
      <button
        type="button"
        className={iconBtn}
        aria-label={`View ${j.title}`}
        title="View"
        onClick={() => navigate("job", { id: String(j.id) })}
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label={`Edit ${j.title}`}
        title="Edit"
        onClick={() => openEdit(j)}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
  // Task 39 (per user, mobile) — responsive columns at the call site (the
  // sanctioned usage pattern for the BEUI block): below md the 700px fixed
  // widths crush the flexible Position column to the block's 64px floor
  // (only the logo was visible). Phones get a 3-column set that FITS the
  // viewport — Position (flexible, logo hidden, deadline folded into the
  // subtitle), Status, Actions. sm+ keeps the full 7-column table.
  const isMobile = useIsMobile();
  const jobColumns: TableColumn<JobWire>[] = isMobile
    ? [
        {
          key: "title",
          header: "Position",
          // Declared (not flexible): the block's trailing filler col also
          // shares the leftover space under table-layout:fixed, so an
          // undeclared column gets only half — 120px declares the full
          // mobile budget (120 + 140 + 98 = the ~358px card interior).
          // Task 10-e — Status takes 140px: the badge column carries the
          // full deadline ladder ("Closing in 3 days" needs ~130px) and
          // the position title truncates gracefully instead.
          width: "120px",
          cell: (j) => (
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => navigate("job", { id: String(j.id) })}
                  className="focus-ring block max-w-full truncate rounded-sm text-sm font-medium text-ink transition-colors hover:text-metric-blue"
                >
                  {j.title}
                </button>
                <p className="mt-0.5 truncate text-xs text-stone">
                  {[j.positionType, j.deadlineDate ? `Deadline ${formatDate(j.deadlineDate)}` : null]
                    .filter(Boolean)
                    .join(" · ") || "-"}
                </p>
              </div>
            </div>
          ),
        },
        {
          key: "status",
          header: "Status",
          width: "140px",
          // Save-as-later batch — publication dropdown + the deadline ladder
          // pill (published rows only — a pending row shows no ladder, it is
          // not even on the board). Stacked like the review queue's status
          // column anatomy.
          cell: (j) => (
            <div className="flex flex-col items-start gap-1">
              <PublicationDropdown job={j} compact onChange={onStatusChange} />
              {j.status === "PUBLISHED" ? <JobStatusPill job={j} /> : null}
            </div>
          ),
        },
        {
          key: "actions",
          header: "",
          width: "98px",
          align: "right",
          cell: (j) => <div className="flex justify-end gap-1">{jobQuickActions(j)}</div>,
        },
      ]
    : [
    {
      key: "title",
      header: "Position",
      cell: (j) => (
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="contents">
            <BrandLogo logoSize={20} />
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate("job", { id: String(j.id) })}
              className="focus-ring block max-w-full truncate rounded-sm text-sm font-medium text-ink transition-colors hover:text-metric-blue"
            >
              {j.title}
            </button>
            <p className="mt-0.5 truncate text-xs text-stone">
              {[j.position?.itemNumber, j.positionType, j.position?.division, j.position?.section].filter(Boolean).join(" · ") || "-"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "numberOfVacancy",
      header: "Vacancies",
      width: "110px",
      editable: true,
    },
    {
      key: "salary",
      header: "Monthly salary",
      width: "130px",
      cell: (j) => (
        <span className="num font-medium text-stone">
          {j.position?.salaryAmount != null ? formatCurrency(j.position.salaryAmount) : "-"}
        </span>
      ),
    },
    {
      key: "applicationCount",
      header: "Applications",
      width: "90px",
      cell: (j) => <span className="num text-stone">{j.applicationCount}</span>,
    },
    {
      key: "deadlineDate",
      header: "Deadline",
      width: "130px",
      cell: (j) => {
        const dl = deadlineState(j.deadlineDate);
        const urgent = isOpenJob(j) && dl.closingSoon;
        return (
          <span className={`num inline-flex items-center gap-1.5 ${urgent ? "text-[var(--bad)]" : "text-stone"}`}>
            {urgent ? <Clock className="h-3 w-3" aria-hidden /> : null}
            {formatDate(j.deadlineDate)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      // 160px — the publication dropdown (max 140px) rides above the widest
      // ladder label ("Closing in 3 days", ~130px); the Position column
      // flexes around it.
      width: "160px",
      cell: (j) => (
        <div className="flex flex-col items-start gap-1">
          <PublicationDropdown job={j} onChange={onStatusChange} />
          {j.status === "PUBLISHED" ? <JobStatusPill job={j} /> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      // Task 13 — two quiet icon actions (View · Edit, 36px each + gap) after
      // the per-row invite button retired to the Pipeline kanban; 110px keeps
      // the flexible Position column as wide as possible.
      width: "110px",
      align: "right",
      cell: (j) => <div className="flex justify-end gap-1.5">{jobQuickActions(j)}</div>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Recruitment"
        description={
          <span className="num">
            {filtered.length} posting{filtered.length === 1 ? "" : "s"}
          </span>
        }
        actions={
          <>
            <RefreshButton onRefresh={() => load(true)} />
            <button type="button" className={ctaBtn} onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              Create Job
            </button>
          </>
        }
      />

      {/* Filter toolbar — white card row: search grows, capsule selects fixed */}
      <div className="dlg-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconChip icon={Search} tone="slate" size={40} className="shrink-0 max-sm:hidden" />
          <Input
            className="flex-1"
            placeholder="Search title, item no., or place…"
            value={search}
            onChange={(next) => setSearch(next)}
            aria-label="Search job postings"
          />
        </div>
        <Select
          className="w-full sm:w-44"
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as typeof statusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="min-h-[44px]">
            <span className="sr-only">Status filter</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {/* Save-as-later batch — publication lenses alongside the
                deadline lenses; pending rows are staff-only drafts. */}
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          className="w-full sm:w-44"
          value={sortBy}
          onValueChange={(v) => {
            setSortBy(v as typeof sortBy);
            setPage(1);
          }}
        >
          <SelectTrigger className="min-h-[44px]">
            <span className="sr-only">Sort</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently posted</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
            <SelectItem value="applications">Applications</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="dlg-card p-8">
          <EmptyState
            icon={AlertTriangle}
            tone="rose"
            title="Couldn't load job postings"
            description={error}
            action={
              <button type="button" className={ghostBtn} onClick={() => void load()}>
                Retry
              </button>
            }
          />
        </div>
      ) : jobs === null ? (
        <div className="dlg-card p-6">
          <SkeletonRows rows={6} rowClassName="h-14" />
        </div>
      ) : pageRows.length === 0 ? (
        <div className="dlg-card p-6">
          <EmptyState
            icon={Briefcase}
            tone="amber"
            title="No postings found"
            description="No job postings match the current filters."
            action={
              <button type="button" className={ctaBtn} onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden />
                Create Job
              </button>
            }
          />
        </div>
      ) : (
        <div className="dlg-card table-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
            <IconChip icon={Briefcase} tone="amber" size={36} iconSize={16} />
            <h2 className="text-base font-medium text-ink">Job postings</h2>
            <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
              {filtered.length} total
            </span>
          </div>
          {/* BEUI Phase 5/7 — official virtualized Table (beui.dev/r/table).
              Toolbar, filters, sort Select and the Pagination below remain the
              unchanged RMIS anatomy; only the table itself became the block.
              Phase 7: Vacancies is inline-editable through the official
              editable/onCellEdit contract (beui.dev/r/table-editable). */}
          <Table
            data={pageRows}
            columns={jobColumns}
            getRowId={(j) => String(j.id)}
            rowHeight={ROW_H}
            height={(pageRows.length + 1) * ROW_H}
            onCellEdit={onVacancyEdit}
            className={cn(
              "rounded-none border-0 [&_table]:w-full",
              // Task 39 (mobile): the block's td/th wear px-4; below sm that
              // steals 8px per cell from the tight 3-column budget — px-3
              // keeps the declared widths ellipsis-free on phones.
              "max-sm:[&_td]:px-3 max-sm:[&_th]:px-3"
            )}
          />
        </div>
      )}

      {/* Pagination */}
      {jobs !== null && filtered.length > 0 && (
        <Pagination
          page={safePage}
          pageCount={totalPages}
          total={filtered.length}
          onPage={setPage}
          unit="postings"
        />
      )}

      <JobFormDialog open={formOpen} onOpenChange={setFormOpen} job={editJob} onSaved={() => void load(true)} />
    </div>
  );
}
