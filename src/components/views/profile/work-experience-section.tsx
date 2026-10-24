"use client";

// ============================================================================
// RMIS — Profile builder · Section 03 Work Experience (spec §7.4). Entry
// cards + add/edit dialog + confirm delete. Edits are delete + recreate
// (§6.3). "Currently employed here?" clears/disables Date to.
// AddEntryButton: dashed "Add additional entry" slot at the foot of the
// list — reachable at any list length.
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with entries on file the section opens as a quiet preview —
// entry tiles render WITHOUT the per-row Edit/Delete cluster and without any
// Add affordance. "Edit Profile" reveals the row actions and the foot
// dashed slot — the Task 15 header Add button is RETIRED (user request):
// the foot "Add additional entry" slot is the single add path
// (mutations still persist immediately, per entry); "Done Editing" returns to the preview. An EMPTY section boots
// straight into edit mode (the inline first-entry form IS the add path) —
// there is nothing to preview yet, mirroring section 01's new-record boot.
// No draft state exists here, so the view-level unsaved navigation guard
// does not apply to this section.
// Bevel pass: local white section panel (dlg-card-plain) + cloud/60 entry
// tiles + header save indicator + functional destructive styling (--bad);
// all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { Pencil } from "lucide-react";
import { WorkExperienceIcon } from "@/components/icons/section-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SectionCard } from "@/components/ui/shell";
import { ghostBadBtn, cancelBtn, sectionCtaBtn } from "@/components/ui/buttons";
import { SectionEditActions } from "./section-edit-actions";
import { formatCurrency, humanize } from "@/lib/client";
import { EMPLOYMENT_STATUS_OPTIONS } from "@/lib/constants";
import InlineEntryForm, { type FormFieldConfig } from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog from "./form-dialog";
import { announceSectionSaved, useSectionMutations } from "./section-mutations";
import { EntryTile, EntryTileActions } from "./preview-kit";
import { ItemGroup } from "@/components/ui/item";
import { dateInput, type WorkRow } from "./section-types";

export default function WorkExperienceSection({
  items,
  onChanged,
}: {
  items: WorkRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, parent
  // refresh, busy gating) lives in the shared deep module —
  // this section owns only its field config and dialog/confirm state.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "work-experiences",
    noun: "Work experience",
    onChanged,
  });

  // Shared field config — powers both the add/edit dialog and the inline
  // first-entry form shown while the section is empty (Task 25).
  const fields: FormFieldConfig[] = [
    { key: "positionTitle", label: "Position Title", type: "text", required: true, full: true },
    { key: "employerName", label: "Employer Name", type: "text", required: true, full: true },
    {
      key: "statusOfEmployment",
      label: "Status of Employment",
      type: "select",
      options: EMPLOYMENT_STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
    },
    { key: "employerAddress", label: "Employer Address", type: "text" },
    {
      key: "dateFrom",
      toKey: "dateTo",
      label: "Inclusive dates",
      type: "daterange",
      placeholder: "Select employment period",
      disabledIf: (v) => v.isPresentWork === true,
      helper: "Leave the end open while this is your current role",
      full: true,
    },
    { key: "isPresentWork", label: "Currently employed here?", type: "checkbox" },
    { key: "monthlySalary", label: "Monthly Salary (PHP)", type: "number", placeholder: "0" },
    { key: "isGovtService", label: "Government service", type: "switch" },
    { key: "actualDuties", label: "Actual Duties", type: "textarea", placeholder: "Summarize your responsibilities" },
  ];

  const initial = editing
    ? {
        positionTitle: editing.positionTitle ?? "",
        employerName: editing.employerName ?? "",
        statusOfEmployment: editing.statusOfEmployment ?? "",
        employerAddress: editing.employerAddress ?? "",
        dateFrom: dateInput(editing.dateFrom),
        dateTo: dateInput(editing.dateTo),
        isPresentWork: editing.isPresentWork === true,
        monthlySalary: editing.monthlySalary ?? "",
        isGovtService: editing.isGovtService === true,
        actualDuties: editing.actualDuties ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    // Dialog closes the moment the POST settles (hook onSuccess), BEFORE
    // the refresh runs — exact legacy ordering; failures keep it open.
    await saveEntry(values, editing, () => {
      setOpen(false);
      setEditing(null);
    });
  };

  const remove = (id: number) =>
    removeEntry(id, () => setDeleteId(null));

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      iconArt={<WorkExperienceIcon className="size-9" />}
      title="Work Experience"
      description={
        editMode
          ? "Editing — entries save as you add or change them."
          : "Read-only preview — click Edit Profile to make changes."
      }
      /* User QA 2026-10-21: BOTH header controls — "Edit Profile" AND "Done
         Editing" — stay top-right beside the
         heading on phones in both states (same anatomy as sm+) — the Done
         Editing pill occupies the exact Edit Profile slot. */
      actionsInlineOnMobile
      actions={
        editMode ? (
          <SectionEditActions
            onCancel={() => setEditMode(false)}
            onDone={() => {
              setEditMode(false);
              announceSectionSaved("Work Experience");
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className={sectionCtaBtn}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit Profile
          </button>
        )
      }
    >
      {items.length === 0 ? (
        <InlineEntryForm
          fields={fields}
          busy={busy}
          submitLabel="Add Work Experience"
          onSubmit={save}
          title="Add your first work experience"
        />
      ) : (
        <ItemGroup className="gap-3" aria-label="Work experience entries">
          {items.map((row) => (
            <EntryTile
              key={row.id}
              title={row.positionTitle ?? "Position not specified"}
              subtitle={row.employerName ?? undefined}
              meta={[
                row.statusOfEmployment ? humanize(row.statusOfEmployment) : null,
                row.dateFrom || row.dateTo || row.isPresentWork
                  ? `${row.dateFrom ? new Date(row.dateFrom).toLocaleDateString("en-PH", { month: "short", year: "numeric" }) : "?"} – ${
                      row.isPresentWork || !row.dateTo
                        ? "Present"
                        : new Date(row.dateTo).toLocaleDateString("en-PH", { month: "short", year: "numeric" })
                    }`
                  : null,
                row.monthlySalary != null ? formatCurrency(row.monthlySalary) : null,
                row.isGovtService ? "Government service" : null,
              ]}
              actions={
                editMode ? (
                  <EntryTileActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => setDeleteId(row.id)}
                    editLabel="Edit work experience"
                    deleteLabel="Delete work experience"
                  />
                ) : undefined
              }
            >
              {row.actualDuties && (
                <p className="mt-3 line-clamp-2 border-t border-divider pt-2.5 text-xs leading-relaxed text-stone">
                  {row.actualDuties}
                </p>
              )}
            </EntryTile>
          ))}
          {/* Add additional entry — always reachable at the foot of the list,
              however many entries exist (mirrors the header Add button).
              Task 41: hidden in the read-only preview. */}
          {editMode && (
            <AddEntryButton
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            />
          )}
        </ItemGroup>
      )}

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? "Edit Work Experience" : "Add Work Experience"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={fields}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this work experience?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry from your profile and may change your experience-years total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
