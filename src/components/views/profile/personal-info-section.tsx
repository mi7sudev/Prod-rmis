"use client";

// ============================================================================
// RMIS — Profile builder · Section 01 Personal Information (spec §7.4).
// 4 SUB-PARTS, ONE VISIBLE AT A TIME (user request): Identity, Address,
// Legal Disclosures (conditional detail fields), Character References
// (1–5 rows; empty-name rows filtered at save). The active sub-part is
// chosen from the wizard rail's nested tasks (lg+) or the compact pill
// switcher (below lg) — the disclosure collapsibles are RETIRED: the
// selected sub-part's form is always fully visible, nothing hides behind
// a chevron anymore.
// Task 40 — READ-ONLY PREVIEW BY DEFAULT (user request): the section opens
// as a quiet preview of the SAVED record — plain label/value rows inside the
// selected sub-part's panel (never disabled inputs). Editing is an
// explicit session:
//   • "Edit Profile" swaps the preview for the form and seeds the draft
//     from the freshest server profile;
//   • AUTOSAVE (user directive 2026-10-21 — "stick with the done editing
//     just like the rest of the section the 2-7"): "Save Changes" and
//     "Cancel" are RETIRED. Every field/reference edit persists
//     automatically ~0.8 s after the last keystroke through the same PUT
//     /api/applicant/profile whitelist endpoint (every field is optional
//     server-side, so a partial draft is a legal save). Editing itself is
//     feedback-quiet — no per-keystroke toast, and the header SaveHint is
//     RETIRED (Task 22 — the toast system is the single save-feedback
//     surface): failures toast, and Done Editing confirms the session with
//     the shared "{Section} saved" toast.
//   • "Done Editing" (the SAME button in the SAME top-right slot as
//     sections 02–07) flushes any pending autosave, enforces the
//     always-required fields (First/Last Name, Email, Mobile — routing to
//     the sub-part that owns a gap) and only then returns to the preview.
//     The view layer (profile-view) still guards section navigation while
//     a save is pending/in-flight/failed via onUnsavedChange.
// A brand-new record (no first name + last name + email yet) boots straight
// into edit mode — there is nothing to preview yet — so first-time
// applicants still land directly on the form.
// BEUI field pass (Task 32/33, unchanged): text fields render the official
// capsule Input (src/components/motion/input), the case-details textarea the
// glue Textarea, selects keep the official BEUI Select on the shared
// beui-form tokens.
// Task 20 UI-CONSISTENCY PASS (user report): the four sub-parts read as two
// different designs — Identity/Address/Legal pinned their field capsules
// white (BEUI_FIELD_FILL) and sat them DIRECTLY on the cloud/60 tile, while
// Character References hosts its rows on white/80 cards with TRANSPARENT
// capsules that blend into the host. The user anchored on Character
// References as the correct look, so the whole section now speaks that one
// language: every sub-part's content lives on a white/80 host and every
// field capsule is transparent (no fill pin anywhere in PI). The beui-form
// "pin white" rule exists to keep fields visible on TINTED hosts — on a
// white/80 host a transparent capsule is visible by construction, so the
// pin is retired here instead of being duplicated on fields that then read
// whiter than their own host.
// MOBILE DE-NESTING PASS (user report): Identity/Address/Legal used to host
// their white/80 SubPanel INSIDE the cloud/60 SubGroup tile — a box in a
// box whose double 16px insets squeezed the fields too thin on phones
// (the other sections host their content ONE level deep). The SubPanel is
// now merged into the sub-part card itself: ONE container with the tinted
// header strip over a flush white/80 body (same colors, one inset). The
// SubPanel survives only as the per-reference ENTRY card in Character
// References — an entry tile, not a wrapper, mirroring how Education and
// the other list sections host one tile per entry.
// HEADER STRIP RETIRED (user request): the sub-part tiles no longer open
// with the "Part 1 of 4 · Identity · 4/13" header — the wizard rail (lg+)
// and the pill switcher (below lg) already name the open sub-part, and no
// other section (Education, Work Experience, Training…) carries a second
// header inside its card. SubGroup is now the bare white/80 tile: one
// rounded host with the fields directly inside (the SubPanel anatomy).
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { Mail, Pencil, Phone, Plus, User } from "lucide-react";
import { PersonalInfoIcon } from "@/components/icons/section-icons";
import { apiFetch } from "@/lib/client";
import { CIVIL_STATUS_OPTIONS } from "@/lib/constants";
import { SectionCard } from "@/components/ui/shell";
import { sectionCtaBtn } from "@/components/ui/buttons";
import { useAuthErrors, isEmailShape } from "@/components/forms/field-errors";
import { Input } from "@/components/motion/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/forms/textarea";
import { cn } from "@/lib/utils";
import YesNoField from "./yes-no-field";
import { announceSectionSaved } from "./section-mutations";
import { SectionEditActions } from "./section-edit-actions";
// Read-only preview kit — the shared spec-sheet language (hairline grid,
// "Not provided" empty states, Yes/No badges). PreviewRow keeps its call-site
// name as an alias of PreviewField so the field lists stay untouched.
import {
  PreviewField as PreviewRow,
  PreviewGrid,
  PreviewNote,
  PreviewYesNo,
} from "./preview-kit";
import { BEUI_FIELD_LABEL, BEUI_MOBILE_ERROR_LINE } from "./beui-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import type { ApplicantProfile, CharacterReference } from "./section-types";

// ── Draft model ─────────────────────────────────────────────────────────────

type PersonalForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  extensionName: string;
  emailAddress: string;
  mobileNumber: string;
  contactNumber: string;
  birthDate: string;
  birthPlace: string;
  gender: string;
  civilStatus: string;
  citizenship: string;
  ethnicity: string;
  isPwd: boolean;
  presentAddress: string;
  houseNumber: string;
  street: string;
  subdivision: string;
  barangay: string;
  city: string;
  province: string;
  country: string;
  zipCode: string;
  isGovernment: boolean;
  adminCase: boolean;
  adminCaseDetails: string;
  crimeCharge: boolean;
  crimeDate: string;
  crimeCaseStatus: string;
};

const EMPTY_FORM: PersonalForm = {
  firstName: "", middleName: "", lastName: "", extensionName: "",
  emailAddress: "", mobileNumber: "", contactNumber: "",
  birthDate: "", birthPlace: "", gender: "", civilStatus: "", citizenship: "", ethnicity: "",
  isPwd: false,
  presentAddress: "", houseNumber: "", street: "", subdivision: "", barangay: "",
  city: "", province: "", country: "", zipCode: "",
  isGovernment: false, adminCase: false, adminCaseDetails: "",
  crimeCharge: false, crimeDate: "", crimeCaseStatus: "",
};

const EMPTY_REF: CharacterReference = { name: "", title: "", company: "", companyAddress: "", email: "", contact: "" };

// ── Sub-parts (MOM) ─────────────────────────────────────────────────────────
// Personal Information renders ONE sub-part at a time. The wizard rail's
// nested tasks (lg+) and the section's pill switcher (below lg) both drive
// the parent's `piSub` state and pass it back down as `sub`; the draft
// lives in this component, so switching sub-parts never drops unsaved edits.

export type PiSub = "identity" | "address" | "legal" | "references";

export const PI_SUBS: { id: PiSub; label: string; short: string }[] = [
  { id: "identity", label: "Identity", short: "Identity" },
  { id: "address", label: "Address", short: "Address" },
  { id: "legal", label: "Legal Disclosures", short: "Legal" },
  { id: "references", label: "Character References", short: "References" },
];

function seedForm(p: ApplicantProfile | null): PersonalForm {
  if (!p) return { ...EMPTY_FORM };
  return {
    firstName: p.firstName ?? "",
    middleName: p.middleName ?? "",
    lastName: p.lastName ?? "",
    extensionName: p.extensionName ?? "",
    emailAddress: p.emailAddress ?? "",
    mobileNumber: p.mobileNumber ?? "",
    contactNumber: p.contactNumber ?? "",
    birthDate: p.birthDate ?? "",
    birthPlace: p.birthPlace ?? "",
    gender: p.gender ?? "",
    civilStatus: p.civilStatus ?? "",
    citizenship: p.citizenship ?? "",
    ethnicity: p.ethnicity ?? "",
    isPwd: p.isPwd === true,
    presentAddress: p.presentAddress ?? "",
    houseNumber: p.houseNumber ?? "",
    street: p.street ?? "",
    subdivision: p.subdivision ?? "",
    barangay: p.barangay ?? "",
    city: p.city ?? "",
    province: p.province ?? "",
    country: p.country ?? "",
    zipCode: p.zipCode ?? "",
    isGovernment: p.isGovernment === true,
    adminCase: p.adminCase === true,
    adminCaseDetails: p.adminCaseDetails ?? "",
    crimeCharge: p.crimeCharge === true,
    crimeDate: p.crimeDate ?? "",
    crimeCaseStatus: p.crimeCaseStatus ?? "",
  };
}

// ── Preview primitives (Task 40) ────────────────────────────────────────────

/** ISO date (YYYY-MM-DD, or a full ISO datetime) → "May 12, 1990".
 *  Unparseable input falls back to the raw string. */
function formatDate(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (raw === "") return "";
  const iso = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

// ── Small field primitives (edit mode) ──────────────────────────────────────

// Task 33 — official SignUpForm tokens: the select label uses the exact
// field-label grammar the official Input renders. Task 20: the trigger keeps
// the official field tokens (h-11 capsule height, border-border) MINUS the
// fill — the official SelectTrigger ships bg-background (white), which would
// read whiter than the white/80 sub-part body, so bg-transparent wins the
// tailwind-merge conflict and the trigger blends exactly like every other
// capsule in the section (the Character References behavior the user
// anchored as correct). Corner radius stays the official Select's own.
const labelCls = BEUI_FIELD_LABEL;
const inputCls = "h-11 w-full bg-transparent border-border";
const NONE = "__none__";

function TextField({
  label, required, helper, value, onChange, type = "text", placeholder, error, icon, onBlur,
}: {
  label: string; required?: boolean; helper?: string; value: string;
  onChange: (v: string) => void; type?: string; placeholder?: string; error?: string;
  icon?: ReactNode; onBlur?: () => void;
}) {
  return (
    <div>
      {/* Official BEUI Input renders its own label; required fields get a
          trailing " *" (the official label prop is a plain string). Passing
          `error` arms the official shake + red ring + message; every field
          reserves its error line (auth rhythm). `icon` renders the official
          left-icon capsule; onBlur passthrough drives the Task 32 touch. */}
      <Input
        type={type}
        label={required ? `${label} *` : label}
        value={value}
        placeholder={placeholder}
        error={error}
        reserveErrorLine
        leftIcon={icon}
        classNames={{ errorLine: BEUI_MOBILE_ERROR_LINE }}
        onChange={onChange}
        onBlur={onBlur}
      />
      {helper && <p className="mt-1 text-xs text-body-gray">{helper}</p>}
    </div>
  );
}

function SelectField({
  label, required, helper, value, options, onChange,
}: {
  label: string; required?: boolean; helper?: string; value: string;
  options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className={labelCls}>
        {label}
        {required && <span className="text-dusty-rose"> *</span>}
      </Label>
      {/* Official BEUI Select on the official field tokens (Task 33) —
          items must carry plain-string children so the trigger label
          registration resolves (span child = raw value shown). */}
      <Select value={value !== "" ? value : NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className={inputCls}>
          <span className="sr-only">{label}</span>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          <SelectItem value={NONE} className="text-stone">
            Not specified
          </SelectItem>
        </SelectContent>
      </Select>
      {helper && <p className="mt-1 text-xs text-body-gray">{helper}</p>}
    </div>
  );
}

/** Character-reference ENTRY card — the per-reference tile in the
 *  Character References sub-part (an entry tile, like Education's cloud/60
 *  entry rows — NOT a wrapper around the whole sub-part). Transparent
 *  capsules are safe on this white/80 host: the fill is the card's own, so
 *  a field can never render invisible (the beui "pin white" rule targets
 *  fields sitting DIRECTLY on a TINTED host, which none here do). */
function SubPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-3xl border border-border bg-white/80 p-4", className)}>{children}</div>;
}

/** Sub-part tile — chrome-less (user request): the "Part 1 of 4 · Identity ·
 *  4/13" header strip is retired — the wizard rail (lg+) and the compact pill
 *  switcher (below lg) already name the open sub-part, and no other section
 *  (Education, Work Experience, Training…) carries a second header inside its
 *  card. What remains is the bare white/80 host the de-nesting pass settled
 *  on: ONE rounded tile hosting the fields directly, so transparent capsules
 *  still read. Always-open: the disclosure chevron stays retired — with the
 *  stepper showing one sub-part at a time there is nothing left to hide. */
function SubGroup({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-border bg-white/80 p-4">{children}</div>;
}

function RefRow({
  index, reference, onChange, onRemove, canRemove,
}: {
  index: number; reference: CharacterReference; onChange: (patch: Partial<CharacterReference>) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const fields: { key: keyof CharacterReference; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "title", label: "Title / Position" },
    { key: "company", label: "Company" },
    { key: "companyAddress", label: "Company Address" },
    { key: "email", label: "Email", type: "email" },
    { key: "contact", label: "Contact No." },
  ];
  return (
    <SubPanel>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-stone">Reference <span className="num">{index + 1}</span></p>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="focus-ring min-h-[44px] px-3 text-xs text-stone underline-offset-4 hover:text-[var(--bad)] hover:underline disabled:opacity-40"
        >
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        {fields.map((f) => (
          <Input
            key={f.key}
            type={f.type ?? "text"}
            label={f.label}
            value={(reference[f.key] as string | null) ?? ""}
            reserveErrorLine
            classNames={{ errorLine: BEUI_MOBILE_ERROR_LINE }}
            onChange={(next) => onChange({ [f.key]: next })}
          />
        ))}
      </div>
    </SubPanel>
  );
}

// ── Main section ────────────────────────────────────────────────────────────

export default function PersonalInfoSection({
  profile,
  seed,
  sub,
  onSubChange,
  refreshSession,
  onChanged,
  onUnsavedChange,
}: {
  profile: ApplicantProfile | null;
  /** Bump to force a re-seed from the server profile (after PDS auto-apply / clear). */
  seed: number;
  /** Active sub-part — ONLY this sub-part's form/preview renders (user
   *  request). Driven by the wizard rail's nested tasks (lg+) or the pill
   *  switcher below (mobile); the draft survives every switch. */
  sub: PiSub;
  /** Switch the visible sub-part (pill row on < lg; the parent also routes
   *  save-time gap fixes here). */
  onSubChange?: (sub: PiSub) => void;
  refreshSession: () => Promise<unknown>;
  /** Silent parent reload — fired after a successful save so the preview
   *  renders the server truth, not the pre-save snapshot. */
  onChanged?: () => void | Promise<void>;
  /** Reports whether leaving the section right now would drop unsaved edits
   *  (the view-level navigation guard). Reports false on unmount. */
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  // Task 40 — a brand-new record boots straight into edit mode (nothing to
  // preview yet); an existing record opens as the read-only preview.
  const [editing, setEditing] = useState(() => {
    const p = profile;
    if (!p) return true;
    return (
      (p.firstName ?? "").trim() === "" &&
      (p.lastName ?? "").trim() === "" &&
      (p.emailAddress ?? "").trim() === ""
    );
  });
  const [form, setForm] = useState<PersonalForm>(EMPTY_FORM);
  const [refs, setRefs] = useState<CharacterReference[]>([{ ...EMPTY_REF }]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const formRef = useRef(form);
  const refsRef = useRef(refs);
  const seededToken = useRef<string>("");
  /** Debounced autosave timer — every edit reschedules it; when it fires the
   *  WHOLE draft persists (the endpoint is a whitelist update, so a partial
   *  draft is a legal PUT). */
  const autosaveTimer = useRef<number | null>(null);
  /** In-flight autosave promise — new saves chain behind it so nothing
   *  overlaps and the latest typed value always wins. */
  const inFlight = useRef<Promise<boolean> | null>(null);

  // Keep latest-value refs in sync after commit (never during render).
  useEffect(() => {
    formRef.current = form;
    refsRef.current = refs;
  }, [form, refs]);

  // Seed (and re-seed on `seed` bumps — PDS auto-apply replaces the record)
  // from the loaded profile. Never re-seeds on plain profile updates, so an
  // in-progress edit session is never clobbered by a silent reload.
  useEffect(() => {
    if (!profile) return;
    const token = `${seed}`;
    if (seededToken.current === token) return;
    seededToken.current = token;
    setForm(seedForm(profile));
    const list = Array.isArray(profile.characterReferences) ? profile.characterReferences : [];
    setRefs(list.length > 0 ? list.map((r) => ({ ...EMPTY_REF, ...r })) : [{ ...EMPTY_REF }]);
    setSaveState("idle");
  }, [profile, seed]);

  // Task 32 — official SignUpForm timing: rules are derived on EVERY render
  // (an error clears the moment its field is fixed); `shown` reveals a rule
  // only once the field has been left (onBlur) or Done Editing was pressed.
  // Typed over ALL PersonalForm keys (not just the ones with rules) so the
  // blur touch covers every field in the section.
  // MOM 2026-10-13 — Email Address and Mobile Number are ALWAYS required
  // (email must also be a valid address shape).
  const rules: Partial<Record<keyof PersonalForm, string>> = {
    firstName: form.firstName.trim() === "" ? "First Name is required." : undefined,
    lastName: form.lastName.trim() === "" ? "Last Name is required." : undefined,
    emailAddress:
      form.emailAddress.trim() === ""
        ? "Email Address is required."
        : !isEmailShape(form.emailAddress.trim())
          ? "Enter a valid email address."
          : undefined,
    mobileNumber: form.mobileNumber.trim() === "" ? "Mobile Number is required." : undefined,
    ...(form.adminCase && form.adminCaseDetails.trim() === ""
      ? { adminCaseDetails: "Describe the administrative case to continue." }
      : {}),
  };
  const { shown, touch, touchAll, reset, hasGaps } = useAuthErrors(rules);

  /** AUTOSAVE (user directive 2026-10-21): persist the whole draft WITHOUT
   *  leaving edit mode. Silent on success — the header hint's "Saved ✓"
   *  flash is the feedback (a toast behind every paused keystroke would be
   *  spam); failures toast AND tint the hint. Overlapping saves chain
   *  behind the in-flight promise so nothing doubles-writes. */
  const persist = useCallback((): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      setSaveState("saving");
      try {
        const payload: Record<string, string | boolean | CharacterReference[]> = {
          ...formRef.current,
          characterReferences: refsRef.current
            .map((r) => ({
              name: (r.name ?? "").trim(),
              title: (r.title ?? "").trim(),
              company: (r.company ?? "").trim(),
              companyAddress: (r.companyAddress ?? "").trim(),
              email: (r.email ?? "").trim(),
              contact: (r.contact ?? "").trim(),
            }))
            .filter((r) => r.name !== ""), // empty-name rows filtered at save (§7.4)
        };
        await apiFetch("/api/applicant/profile", { method: "PUT", body: payload });
        setSaveState("saved");
        await refreshSession();
        // Silent parent reload so the preview (and every other section that
        // reads the profile) renders the server truth, not a stale snapshot.
        await onChanged?.();
        return true;
      } catch (e) {
        setSaveState("error");
        toast.error(e instanceof Error ? e.message : "Save failed. Please try again");
        return false;
      }
    };
    if (inFlight.current) {
      const chained = inFlight.current.then(() => run());
      inFlight.current = chained;
      return chained;
    }
    const p = run();
    inFlight.current = p;
    void p.then(() => {
      if (inFlight.current === p) inFlight.current = null;
    });
    return p;
  }, [refreshSession, onChanged]);

  /** Every edit marks the draft and reschedules the debounced save. */
  const scheduleAutosave = useCallback(() => {
    setSaveState("dirty");
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void persist();
    }, 800);
  }, [persist]);

  // Timer cleanup on unmount. An in-flight PUT finishing after unmount is
  // fine — the save itself still lands server-side.
  useEffect(
    () => () => {
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    },
    []
  );

  // ── Edit-session lifecycle (Task 40) ──────────────────────────────────────

  const enterEdit = useCallback(() => {
    if (!profile) return;
    // Seed the draft from the freshest server profile (NOT the stale local
    // form) so every edit session starts from the saved record.
    setForm(seedForm(profile));
    const list = Array.isArray(profile.characterReferences) ? profile.characterReferences : [];
    setRefs(list.length > 0 ? list.map((r) => ({ ...EMPTY_REF, ...r })) : [{ ...EMPTY_REF }]);
    seededToken.current = String(seed); // keep the seed effect from re-firing
    setSaveState("idle");
    reset();
    setEditing(true);
  }, [profile, seed, reset]);

  const exitEdit = useCallback(() => {
    setEditing(false);
    setSaveState("idle");
    reset();
  }, [reset]);

  /** Done Editing (user directive: the same pattern/position as sections
   *  02–07) — flush any pending autosave, gate on the ALWAYS-required fields
   *  (routing to the sub-part that owns a gap), and only then return to the
   *  preview. A failed flush keeps the session open so the applicant can
   *  retry; the gap path re-arms the autosave so pending edits still land. */
  const doneEditing = useCallback(async () => {
    touchAll();
    if (hasGaps) {
      scheduleAutosave();
      const gapSub: PiSub | null =
        rules.firstName || rules.lastName || rules.emailAddress || rules.mobileNumber
          ? "identity"
          : rules.adminCaseDetails
            ? "legal"
            : null;
      if (gapSub && gapSub !== sub) {
        onSubChange?.(gapSub);
        toast.info(
          `${PI_SUBS.find((s) => s.id === gapSub)?.label ?? "Some fields"} still has required fields to fill.`
        );
      }
      return;
    }
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const ok = await persist();
    // Task 21 — a successful exit announces the save with the SAME toast
    // system sections 02–07 use (title names the section, description states
    // the autosave model). Gate failures return above WITHOUT this toast —
    // the session stays open until the required fields are filled.
    if (ok) {
      exitEdit();
      announceSectionSaved("Personal Information");
    }
  }, [touchAll, hasGaps, scheduleAutosave, rules, sub, onSubChange, persist, exitEdit]);

  /** Cancel (Task 27) — leaves the edit session WITHOUT the Done-Editing
   *  gate and saved-toast. PI saves as you type, so this only flushes the
   *  pending debounced autosave first (cancel never rolls back already-saved
   *  data); failures toast from persist() and the exit still proceeds — the
   *  user asked to leave the session. */
  const cancelEditing = useCallback(async () => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    await persist();
    exitEdit();
  }, [persist, exitEdit]);

  // ── Unsaved-changes reporting for the view-level navigation guard ─────────

  // Unsaved = edits the debounced save hasn't landed yet, a save still in
  // flight, or a failed save — the view-level navigation guard uses this.
  const unsaved = editing && (saveState === "dirty" || saveState === "saving" || saveState === "error");
  const unsavedCbRef = useRef(onUnsavedChange);
  useEffect(() => {
    unsavedCbRef.current = onUnsavedChange;
  });
  useEffect(() => {
    unsavedCbRef.current?.(unsaved);
  }, [unsaved]);
  // Leaving the section (section swap / route change) always clears the guard.
  useEffect(
    () => () => {
      unsavedCbRef.current?.(false);
    },
    []
  );

  const set = useCallback(
    <K extends keyof PersonalForm>(key: K, value: PersonalForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      scheduleAutosave();
    },
    [scheduleAutosave]
  );

  // ── View model: edit sessions render the draft; preview renders the
  //    server record (seedForm over the profile prop) so both modes share
  //    the same counts/conditionals. ────────────────────────────────────────
  const view = editing ? form : seedForm(profile);
  const namedRefs = (editing
    ? refs
    : Array.isArray(profile?.characterReferences)
      ? profile!.characterReferences!
      : []
  ).filter((r) => (r.name ?? "").trim() !== "");

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      iconArt={<PersonalInfoIcon className="size-9" />}
      title="Personal Information"
      description={
        editing
          ? "Editing — changes save as you make them."
          : "Read-only preview — click Edit Profile to make changes."
      }
      /* User QA 2026-10-21: "Done Editing" must sit at the EXACT position of
         "Edit Profile" — the header controls stay pinned top-right beside
         the heading on phones in BOTH states (matches 02–07). Task 27: the
         edit session pairs it with "Cancel" — side by side on sm+, stacked
         Done-Editing-over-Cancel on phones (SectionEditActions). */
      actionsInlineOnMobile
      actions={
        editing ? (
          <SectionEditActions
            onCancel={() => void cancelEditing()}
            onDone={() => void doneEditing()}
          />
        ) : (
          <button
            type="button"
            onClick={enterEdit}
            className={sectionCtaBtn}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit Profile
          </button>
        )
      }
    >
      <div className="space-y-3">
        {/* Sub-part switcher — phones/tablets have no rail, so the four
            sub-parts are reached from this pill row (lg+ hides it: the
            wizard rail's nested tasks do the switching there). */}
        <div className="flex gap-1 overflow-x-auto rounded-full bg-cloud/60 p-1 ring-1 ring-inset ring-border scroll-thin lg:hidden">
          {PI_SUBS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSubChange?.(s.id)}
              aria-current={sub === s.id ? "true" : undefined}
              className={cn(
                "tap-44 min-h-[36px] flex-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium transition-colors",
                sub === s.id ? "bg-primary text-primary-foreground" : "text-stone hover:bg-white/70"
              )}
            >
              {s.short}
            </button>
          ))}
        </div>

        {/* ONE sub-part at a time (user request): only the selected
            sub-part's form/preview renders. The keyed wrapper replays the
            section-swap fade on switch; the draft state above is untouched,
            so unsaved edits survive moving between sub-parts. */}
        <div key={sub} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
        {editing ? (
          <>
            {sub === "identity" && (
              <SubGroup>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                <TextField label="First Name" required placeholder="e.g. Juan" icon={<User />} value={form.firstName} error={shown("firstName")} onChange={(v) => set("firstName", v)} onBlur={() => touch("firstName")} />
                <TextField label="Middle Name" icon={<User />} value={form.middleName} onChange={(v) => set("middleName", v)} onBlur={() => touch("middleName")} />
                <TextField label="Last Name" required placeholder="e.g. Dela Cruz" icon={<User />} value={form.lastName} error={shown("lastName")} onChange={(v) => set("lastName", v)} onBlur={() => touch("lastName")} />
                <TextField
                  label="Extension Name"
                  helper="e.g. Jr., Sr., III"
                  icon={<User />}
                  value={form.extensionName}
                  onChange={(v) => set("extensionName", v)}
                  onBlur={() => touch("extensionName")}
                />
                <TextField
                  label="Email Address"
                  required
                  type="email"
                  helper="Interview invites are sent to this address"
                  icon={<Mail />}
                  value={form.emailAddress}
                  error={shown("emailAddress")}
                  onChange={(v) => set("emailAddress", v)}
                  onBlur={() => touch("emailAddress")}
                />
                <TextField
                  label="Mobile Number"
                  required
                  type="tel"
                  helper="09XXXXXXXXX — notices are also sent here"
                  icon={<Phone />}
                  value={form.mobileNumber}
                  error={shown("mobileNumber")}
                  onChange={(v) => set("mobileNumber", v)}
                  onBlur={() => touch("mobileNumber")}
                />
                <TextField label="Secondary Contact No." type="tel" icon={<Phone />} value={form.contactNumber} onChange={(v) => set("contactNumber", v)} onBlur={() => touch("contactNumber")} />
                <TextField label="Birth Date" type="date" value={form.birthDate} onChange={(v) => set("birthDate", v)} onBlur={() => touch("birthDate")} />
                <TextField label="Birth Place" value={form.birthPlace} onChange={(v) => set("birthPlace", v)} onBlur={() => touch("birthPlace")} />
                <SelectField label="Gender" value={form.gender} options={["Male", "Female"]} onChange={(v) => set("gender", v)} />
                <SelectField
                  label="Civil Status"
                  value={form.civilStatus}
                  options={CIVIL_STATUS_OPTIONS}
                  onChange={(v) => set("civilStatus", v)}
                />
                <TextField label="Citizenship" value={form.citizenship} onChange={(v) => set("citizenship", v)} onBlur={() => touch("citizenship")} placeholder="Filipino" />
                <TextField label="Ethnicity" value={form.ethnicity} onChange={(v) => set("ethnicity", v)} onBlur={() => touch("ethnicity")} />
                <YesNoField label="Person with Disability (PWD)" value={form.isPwd} onChange={(v) => set("isPwd", v)} />
              </div>
              </SubGroup>
            )}

            {sub === "address" && (
              <SubGroup>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField label="Present Address (full)" value={form.presentAddress} onChange={(v) => set("presentAddress", v)} onBlur={() => touch("presentAddress")} />
                </div>
                <TextField label="House Number" value={form.houseNumber} onChange={(v) => set("houseNumber", v)} onBlur={() => touch("houseNumber")} />
                <TextField label="Street" value={form.street} onChange={(v) => set("street", v)} onBlur={() => touch("street")} />
                <TextField label="Subdivision / Village" value={form.subdivision} onChange={(v) => set("subdivision", v)} onBlur={() => touch("subdivision")} />
                <TextField label="Barangay" value={form.barangay} onChange={(v) => set("barangay", v)} onBlur={() => touch("barangay")} />
                <TextField label="City / Municipality" value={form.city} onChange={(v) => set("city", v)} onBlur={() => touch("city")} />
                <TextField label="Province" value={form.province} onChange={(v) => set("province", v)} onBlur={() => touch("province")} />
                <TextField label="Country" value={form.country} onChange={(v) => set("country", v)} onBlur={() => touch("country")} />
                <TextField label="ZIP Code" value={form.zipCode} onChange={(v) => set("zipCode", v)} onBlur={() => touch("zipCode")} />
              </div>
              </SubGroup>
            )}

            {sub === "legal" && (
              <SubGroup>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                <YesNoField label="Are you a government employee?" value={form.isGovernment} onChange={(v) => set("isGovernment", v)} />
                <YesNoField label="Have you been administratively charged?" value={form.adminCase} onChange={(v) => set("adminCase", v)} />
                {form.adminCase && (
                  <div className="sm:col-span-2">
                    <Textarea
                      label="Administrative Case Details *"
                      value={form.adminCaseDetails}
                      onChange={(next) => set("adminCaseDetails", next)}
                      onBlur={() => touch("adminCaseDetails")}
                      error={shown("adminCaseDetails")}
                      reserveErrorLine
                      classNames={{ errorLine: BEUI_MOBILE_ERROR_LINE }}
                      placeholder="Briefly describe the case status and particulars"
                    />
                  </div>
                )}
                <YesNoField label="Have you ever been charged of any crime?" value={form.crimeCharge} onChange={(v) => set("crimeCharge", v)} />
                {form.crimeCharge && (
                  <>
                    <TextField label="Date Filed" type="date" value={form.crimeDate} onChange={(v) => set("crimeDate", v)} onBlur={() => touch("crimeDate")} />
                    <TextField label="Case Status" value={form.crimeCaseStatus} onChange={(v) => set("crimeCaseStatus", v)} onBlur={() => touch("crimeCaseStatus")} />
                  </>
                )}
              </div>
              </SubGroup>
            )}

            {/* Character References (edit) — MOM 2026-10-13: the sub-part is
                REQUIRED before the Education section. */}
            {sub === "references" && (
              <SubGroup>
              <div className="space-y-3">
                {refs.map((r, i) => (
                  <RefRow
                    key={i}
                    index={i}
                    reference={r}
                    canRemove={refs.length > 1}
                    onChange={(patch) => {
                      setRefs((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
                      scheduleAutosave();
                    }}
                    onRemove={() => {
                      if (refs.length <= 1) {
                        toast.info("At least one character reference row is kept");
                        return;
                      }
                      setRefs((prev) => prev.filter((_, j) => j !== i));
                      scheduleAutosave();
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (refs.length >= 5) {
                    toast.info("You can add up to 5 character references");
                    return;
                  }
                  setRefs((prev) => [...prev, { ...EMPTY_REF }]);
                  scheduleAutosave();
                }}
                className="dlg-ghost mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 py-2.5 text-sm sm:w-auto sm:px-6"
              >
                <Plus className="h-4 w-4" /> Add Character Reference
              </button>
              </SubGroup>
            )}
          </>
        ) : (
          <>
            {sub === "identity" && (
              <PreviewGrid>
                <PreviewRow label="First Name" value={view.firstName} />
                <PreviewRow label="Middle Name" value={view.middleName} />
                <PreviewRow label="Last Name" value={view.lastName} />
                <PreviewRow label="Extension Name" value={view.extensionName} />
                <PreviewRow label="Email Address" value={view.emailAddress} />
                <PreviewRow label="Mobile Number" value={view.mobileNumber} />
                <PreviewRow label="Secondary Contact No." value={view.contactNumber} />
                <PreviewRow label="Birth Date" value={formatDate(view.birthDate)} />
                <PreviewRow label="Birth Place" value={view.birthPlace} />
                <PreviewRow label="Gender" value={view.gender} />
                <PreviewRow label="Civil Status" value={view.civilStatus} />
                <PreviewRow label="Citizenship" value={view.citizenship} />
                <PreviewRow label="Ethnicity" value={view.ethnicity} />
                <PreviewYesNo label="Person with Disability (PWD)" value={view.isPwd} />
              </PreviewGrid>
            )}

            {sub === "address" && (
              <PreviewGrid verticalDividers={false}>
                <PreviewRow label="Present Address (full)" value={view.presentAddress} full />
                <PreviewRow label="House Number" value={view.houseNumber} />
                <PreviewRow label="Street" value={view.street} />
                <PreviewRow label="Subdivision / Village" value={view.subdivision} />
                <PreviewRow label="Barangay" value={view.barangay} />
                <PreviewRow label="City / Municipality" value={view.city} />
                <PreviewRow label="Province" value={view.province} />
                <PreviewRow label="Country" value={view.country} />
                <PreviewRow label="ZIP Code" value={view.zipCode} />
              </PreviewGrid>
            )}

            {/* Legal Disclosures (preview) — conditional detail rows
                mirror the edit-mode conditionals. */}
            {sub === "legal" && (
              <PreviewGrid verticalDividers={false}>
                <PreviewYesNo label="Are you a government employee?" value={view.isGovernment} />
                <PreviewYesNo label="Have you been administratively charged?" value={view.adminCase} />
                {view.adminCase && (
                  <PreviewRow label="Administrative Case Details" value={view.adminCaseDetails} full />
                )}
                <PreviewYesNo label="Have you ever been charged of any crime?" value={view.crimeCharge} />
                {view.crimeCharge && (
                  <>
                    <PreviewRow label="Date Filed" value={formatDate(view.crimeDate)} />
                    <PreviewRow label="Case Status" value={view.crimeCaseStatus} />
                  </>
                )}
              </PreviewGrid>
            )}

            {/* Character References (preview) — the SAME spec-sheet language
                as Identity/Address/Legal: one hairline PreviewGrid per
                reference under a "Reference N" micro eyebrow. Name and
                Company Address span full width (the Address pattern for long
                values); Email/Contact carry the kit's icon anchors. Empty
                fields read "Not provided" like everywhere else. MOM
                2026-10-13: required sub-part (red asterisk) before the
                Education section. */}
            {sub === "references" && (
              <div className="space-y-4">
                {namedRefs.length === 0 ? (
                  <PreviewNote>
                    No character references added yet — this section is required. Click Edit Profile to add at
                    least one (up to 5).
                  </PreviewNote>
                ) : (
                  namedRefs.map((r, i) => (
                    <div key={i}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">
                        Reference <span className="num">{i + 1}</span>
                      </p>
                      <PreviewGrid verticalDividers={false}>
                        <PreviewRow label="Name" value={r.name} full />
                        <PreviewRow label="Title / Position" value={r.title} />
                        <PreviewRow label="Company" value={r.company} />
                        <PreviewRow label="Company Address" value={r.companyAddress} full />
                        <PreviewRow label="Email Address" value={r.email} />
                        <PreviewRow label="Contact No." value={r.contact} />
                      </PreviewGrid>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </SectionCard>
  );
}
