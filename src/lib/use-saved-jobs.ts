"use client";

// ============================================================================
// RMIS — Shared client bookmark store for the public job explorer (frontpage)
// and the applicant home "Apply Now" pane. One localStorage key so a job
// saved in either view shows as saved in the other. Client-only, no API.
// ============================================================================

import { useCallback, useEffect, useState } from "react";

export const SAVED_KEY = "rmis-frontpage-saved-jobs";

/** Client-persisted bookmark list (same store as the frontpage). Both open
 *  surfaces stay in sync: the `storage` event fires in every OTHER tab when
 *  one saves/un-saves, and the custom same-tab event covers the two views
 *  mounted in one document (audit 2026-10-22 — the share used to be one-way
 *  stale until a remount). */
export function useSavedJobs() {
  const [saved, setSaved] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const sync = (raw: string | null) => {
      try {
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        setSaved(Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : []);
      } catch {
        /* ignore malformed payloads */
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SAVED_KEY) return;
      sync(e.newValue);
    };
    const onSameTab = () => {
      try {
        sync(window.localStorage.getItem(SAVED_KEY));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("rmis-saved-jobs", onSameTab);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rmis-saved-jobs", onSameTab);
    };
  }, []);

  const toggle = useCallback((id: number) => {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
        // Same-document sync: the storage event only fires across tabs, so
        // dispatch a custom event for the other mounted view.
        window.dispatchEvent(new CustomEvent("rmis-saved-jobs"));
      } catch {
        /* storage unavailable — in-session state still works */
      }
      return next;
    });
  }, []);

  return { saved, toggle };
}
