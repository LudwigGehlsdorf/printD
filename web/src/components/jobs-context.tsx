"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Job } from "@/components/job-history";
import { StatusDot } from "@/components/ui";

type Printer = { online: boolean; message: string };

type JobsState = {
  jobs: Job[] | null;
  /** Jobs currently animating out after being hidden. */
  leaving: ReadonlySet<number>;
  /** Hides a job right away and tells the server in the background. Returns an error message on failure. */
  hide: (id: number) => Promise<string | null>;
  printer: Printer | null;
  hasMore: boolean;
  showMore: () => void;
  refresh: () => Promise<void>;
};

const PAGE_SIZE = 10;
/** Matches the duration of the leave animation (duration-200). */
const LEAVE_MS = 200;

function withId(set: ReadonlySet<number>, id: number, present: boolean) {
  const next = new Set(set);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}
const JobsContext = createContext<JobsState | null>(null);

/** Polls the user's jobs and the printer status once for the whole page. */
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  const refresh = useCallback(async () => {
    // Ask for one extra job to know whether there are more.
    const res = await fetch(`/api/jobs?limit=${limit + 1}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = await res.json();
    setJobs(body.jobs.slice(0, limit));
    setHasMore(body.jobs.length > limit);
    setPrinter(body.printer);
  }, [limit]);

  const hide = useCallback(
    async (id: number) => {
      setLeaving((s) => withId(s, id, true));
      const removed = new Promise((r) => setTimeout(r, LEAVE_MS)).then(() => {
        setHidden((s) => withId(s, id, true));
        setLeaving((s) => withId(s, id, false));
      });
      const res = await fetch(`/api/jobs/${id}/hide`, { method: "POST" }).catch(() => null);
      await removed;
      if (res?.ok) return null;
      // Put it back.
      setHidden((s) => withId(s, id, false));
      return (await res?.json().catch(() => null))?.error ?? "Utskriften kunde inte döljas.";
    },
    [],
  );

  const pending = jobs?.some((j) => j.status === "queued" || j.status === "printing");

  useEffect(() => {
    // refresh() only sets state after its fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const timer = setInterval(refresh, pending ? 3_000 : 15_000);
    return () => clearInterval(timer);
  }, [refresh, pending]);

  return (
    <JobsContext.Provider
      value={{
        jobs: jobs?.filter((j) => !hidden.has(j.id)) ?? null,
        leaving,
        hide,
        printer,
        hasMore,
        showMore: () => setLimit((l) => l + PAGE_SIZE * 2),
        refresh,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs(): JobsState {
  const state = useContext(JobsContext);
  if (!state) throw new Error("useJobs must be used inside <JobsProvider>");
  return state;
}

/** "● Skrivaren är redo" in the header. */
export function PrinterStatus() {
  const { printer } = useJobs();
  if (!printer) return null;
  return (
    <span className="flex items-center gap-2 text-sm" title={printer.message}>
      <StatusDot tone={printer.online ? "success" : "error"} />
      <span className="hidden sm:inline">{printer.message}</span>
    </span>
  );
}
