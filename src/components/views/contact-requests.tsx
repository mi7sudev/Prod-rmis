"use client";

// ============================================================================
// RMIS — Contact Requests view (QA 2026-02 · Task 27 rework, user direction:
// "add the contact request on the evaluator sidebar … the evaluator can view
// the request of the user in a modal … update the resolve and re-open button
// on the table it should be view and the resolve will be inside the modal and
// the evaluator will be able to reply the reply will be send to the retrieved
// email of the user that contacted us").
//
// The panel moved out of Admin Settings into its own view so it can hang on
// the EVALUATOR rail (Settings keeps embedding the same panel for ADMIN — one
// component, both surfaces). The table's row action is now a single "View"
// button that opens the request modal; inside the modal the evaluator gets:
//   · the full inquiry (sender, their email, received stamp, status),
//   · the Resolve / Re-open control (status changes live INSIDE the modal —
//     the table button is gone),
//   · a reply composer whose email goes to the address RETRIEVED from the
//     stored request row (POST /api/admin/contact-requests/reply resolves
//     the recipient server-side, mirroring the direct-email trust model),
//   · the reply thread (every reply is logged to email_logs with
//     relatedType "contact-request" and shown back here).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Inbox, Mail, Send } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deliveryStatusMeta } from "@/lib/status-ui";
import { EmptyState, FilterChip, IconChip, PageHeader, StatusPill, dialogScroll } from "@/components/ui/shell";
import { Table } from "@/components/motion/table";
import { ghostBtn, ctaOkBtn } from "@/components/ui/buttons";
import { StatefulButton } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Textarea } from "@/components/forms/textarea";
import { isEmailShape, useAuthErrors } from "@/components/forms/field-errors";
import { apiFetch, formatDateTime, timeAgo } from "@/lib/client";

export type ContactRow = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  handledBy?: { firstName: string | null; lastName: string | null; username: string } | null;
};

type ReplyLog = {
  id: number;
  to: string;
  subject: string;
  status: string;
  provider: string;
  error: string | null;
  createdAt: string;
};

// ── The request modal — view · reply · resolve, all inside ──────────────────

function RequestModal({
  row,
  onOpenChange,
  onStatusChanged,
}: {
  row: ContactRow | null;
  onOpenChange: (open: boolean) => void;
  onStatusChanged: () => void;
}) {
  const [current, setCurrent] = useState<ContactRow | null>(row);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<ReplyLog[] | null>(null);
  const [sending, setSending] = useState(false);
  const [busyStatus, setBusyStatus] = useState(false);

  const rules = {
    message: !message.trim() ? "Write the reply message." : undefined,
    subject: !subject.trim() ? "Enter a subject." : undefined,
  };
  const { shown, touch, touchAll, reset } = useAuthErrors(rules);

  // Re-seed the composer + thread each time a different request is opened.
  // reset() is stable in useAuthErrors — including it clears the touched-flag
  // state so a reopened modal never shows stale field errors.
  useEffect(() => {
    setCurrent(row);
    setSubject(row ? `Re: ${row.subject}` : "");
    setMessage("");
    setReplies(null);
    reset();
  }, [row, reset]);

  const loadReplies = useCallback(async (id: number, silent = false) => {
    try {
      const res = await apiFetch<{ replies: ReplyLog[] }>(
        `/api/admin/contact-requests/reply?id=${id}`
      );
      setReplies(res.replies);
    } catch (e) {
      setReplies([]);
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load the reply thread");
    }
  }, []);

  useEffect(() => {
    if (current) void loadReplies(current.id);
  }, [current, loadReplies]);

  const sendReply = async () => {
    if (!current) return;
    touchAll();
    if (Object.values(rules).some(Boolean)) return;
    setSending(true);
    try {
      await apiFetch("/api/admin/contact-requests/reply", {
        method: "POST",
        body: { id: current.id, subject: subject.trim(), message: message.trim() },
      });
      toast.success("Reply sent", {
        description: `Emailed to ${current.email} — the address on the request.`,
      });
      setMessage("");
      reset();
      await loadReplies(current.id, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: "OPEN" | "RESOLVED") => {
    if (!current) return;
    setBusyStatus(true);
    try {
      await apiFetch("/api/admin/contact-requests", {
        method: "PATCH",
        body: { id: current.id, status },
      });
      toast.success(status === "RESOLVED" ? "Marked as resolved" : "Reopened");
      setCurrent({ ...current, status });
      onStatusChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyStatus(false);
    }
  };

  const resolved = current?.status === "RESOLVED";

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
    >
      {/* Official dialog anatomy (Task 32 contract): hairline-bordered white
          rounded card + auth header typography + reserved error lines.
          User QA 2026-10 — the xl card was too thin for the reader + composer
          stack: 2xl on laptops, 3xl (768px) from lg. */}
      <DialogContent
        className={`${dialogScroll} rounded-3xl border border-border bg-white sm:max-w-2xl lg:max-w-3xl`}
        ariaLabel="Contact request"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-medium text-foreground">
            {current?.subject ?? "Contact request"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {current
              ? `Received ${formatDateTime(current.createdAt)} (${timeAgo(current.createdAt)})`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div className="flex flex-col gap-5">
            {/* Sender facts + live status */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-cloud/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">From</p>
                <p className="truncate text-sm font-medium text-ink">{current.name}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">Email</p>
                <p className="truncate text-sm font-medium text-ink">{current.email}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <StatusPill status={resolved ? "Resolved" : "Open"} variant={resolved ? "ok" : "warn"} />
              </div>
            </div>

            {/* The inquiry message */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">Message</p>
              <p className="mt-1.5 whitespace-pre-line rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-relaxed text-ink">
                {current.message}
              </p>
            </div>

            {/* Reply thread — every email sent for this request */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">Replies</p>
              {replies === null ? (
                <p className="mt-1.5 text-sm text-stone">Loading…</p>
              ) : replies.length === 0 ? (
                <p className="mt-1.5 text-sm italic text-stone/70">
                  No replies yet — the first one is drafted below.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {replies.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-border bg-white px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ash" />
                        <span className="min-w-0 truncate text-sm font-medium text-ink">{r.subject}</span>
                        <StatusPill
                          status={deliveryStatusMeta(r.status).label}
                          variant={deliveryStatusMeta(r.status).variant}
                          className="ml-auto shrink-0"
                        />
                      </div>
                      <p className="mt-1 text-xs text-stone">
                        To {r.to} · {formatDateTime(r.createdAt)}
                        {r.error ? ` · ${r.error}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Reply composer — delivered to the email on the request */}
            <div className="rounded-2xl bg-cloud/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">
                Reply by email
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone">
                The reply is sent to the address the sender submitted with this request ({current.email}).
              </p>
              <div className="mt-3 flex flex-col gap-4">
                <Input
                  id="contact-reply-subject"
                  label="Subject"
                  value={subject}
                  onChange={setSubject}
                  onBlur={() => touch("subject")}
                  maxLength={200}
                  error={shown("subject")}
                  reserveErrorLine
                  classNames={{ field: "bg-white" }}
                />
                <Textarea
                  id="contact-reply-message"
                  label="Message"
                  value={message}
                  onChange={setMessage}
                  onBlur={() => touch("message")}
                  placeholder="Write the reply…"
                  maxLength={5000}
                  error={shown("message")}
                  reserveErrorLine
                  classNames={{ field: "bg-white", textarea: "min-h-[120px]" }}
                >
                  <p className="px-1 text-xs text-stone">Up to 5,000 characters.</p>
                </Textarea>
                <StatefulButton
                  type="button"
                  size="md"
                  state={sending ? "loading" : "idle"}
                  loadingText="Sending"
                  className="self-start min-h-[44px] px-5 py-2.5"
                  onClick={() => void sendReply()}
                >
                  <Send aria-hidden="true" className="h-4 w-4" /> Send reply
                </StatefulButton>
              </div>
            </div>
          </div>
        )}

        {/* Resolve / Re-open lives INSIDE the modal (user direction) — the
            table row action is a plain View. */}
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>
            Close
          </button>
          {current && (
            <StatefulButton
              type="button"
              size="md"
              state={busyStatus ? "loading" : "idle"}
              loadingText={resolved ? "Reopening" : "Resolving"}
              className={resolved ? ghostBtn : `${ctaOkBtn} min-h-[44px] px-5 py-2.5`}
              onClick={() => void setStatus(resolved ? "OPEN" : "RESOLVED")}
            >
              {resolved ? "Re-open Request" : "Mark as Resolved"}
            </StatefulButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── The panel — table + filters + modal (shared by the evaluator rail view
//    and Admin Settings' Contact tab) ────────────────────────────────────────

export function ContactRequestsPanel() {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [active, setActive] = useState<ContactRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await apiFetch<{ data: ContactRow[] }>(`/api/admin/contact-requests${q}`);
      setRows(res.data);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load contact requests");
      setRows([]);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium text-ink">Contact Requests</h2>
        <p className="mt-1 text-sm leading-relaxed text-body-gray">
          Inquiries and requests submitted through the public Contact page. Open a request to read
          it, reply by email, or mark it resolved.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {(["ALL", "OPEN", "RESOLVED"] as const).map((f) => (
          <FilterChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "All" : f === "OPEN" ? "Open" : "Resolved"}
          </FilterChip>
        ))}
      </div>

      {/* Canonical table anatomy (same as recruitment/candidates/review-queue):
          the request ledger lives in a .dlg-card.table-card with an in-card
          band (icon chip · title · count). The row action is "View" — status
          changes and replies happen inside the modal (Task 27). */}
      <div className="dlg-card table-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <IconChip icon={Inbox} tone="slate" size={36} iconSize={16} />
          <h2 className="text-base font-medium text-ink">Requests</h2>
          <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
            {rows?.length ?? "…"} in view
          </span>
        </div>
      {/* BEUI Phase 5 — official virtualized Table; block loading/emptyState.
          Message preview clamps to two lines to honor the block's fixed-row
          virtualization contract. */}
      <Table
        data={rows ?? []}
        loading={rows === null}
        emptyState={
          <EmptyState
            icon={Inbox}
            tone="slate"
            title="No contact requests yet"
            description="Messages from the public Contact page will appear here."
            compact
          />
        }
        getRowId={(r) => String(r.id)}
        rowHeight={72}
        height={384}
        className="rounded-none border-0 [&_table]:w-full"
        columns={[
          {
            key: "from",
            header: "From",
            width: "190px",
            cell: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-ink">{r.name}</p>
                <p className="truncate text-xs text-body-gray">{r.email}</p>
              </div>
            ),
          },
          {
            key: "subject",
            header: "Subject",
            width: "270px",
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{r.subject}</p>
                <p className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-body-gray">{r.message}</p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            width: "160px",
            cell: (r) => (
              <div className="min-w-0">
                <StatusPill status={r.status === "RESOLVED" ? "Resolved" : "Open"} variant={r.status === "RESOLVED" ? "ok" : "warn"} />
                {r.handledBy && (
                  <p className="mt-1 truncate text-xs text-stone">
                    by {[r.handledBy.firstName, r.handledBy.lastName].filter(Boolean).join(" ") || r.handledBy.username}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: "received",
            header: "Received",
            width: "120px",
            align: "right",
            cell: (r) => (
              <span className="num text-xs text-body-gray" title={formatDateTime(r.createdAt)}>
                {timeAgo(r.createdAt)}
              </span>
            ),
          },
          {
            key: "action",
            header: "Action",
            width: "110px",
            align: "right",
            cell: (r) => (
              <button
                type="button"
                onClick={() => setActive(r)}
                className="focus-ring tap-44 inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-[10px] border border-border bg-white px-3 text-xs font-medium text-ink transition-colors hover:bg-cloud"
                aria-label={`View request from ${r.name}`}
              >
                View
              </button>
            ),
          },
        ]}
      />
      </div>

      <RequestModal
        row={active}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
        onStatusChanged={() => void load(true)}
      />
    </div>
  );
}

// ── The rail view — PageHeader + panel (evaluator sidebar destination) ──────

export default function ContactRequestsView() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-14 pt-8 sm:px-6 lg:px-8">
      <PageHeader
        className="max-w-2xl"
        eyebrow="Support desk"
        title="Contact Requests"
        description="Inquiries and requests submitted through the system's Contact page. Open a request to read it in full, reply to the sender's email, and mark it resolved."
      />
      <div className="mt-8">
        <ContactRequestsPanel />
      </div>
    </div>
  );
}
