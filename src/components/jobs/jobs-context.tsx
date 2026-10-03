"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { StatusDot } from "@/components/ui";
import type { JobView } from "@/lib/jobs";

type Printer = { online: boolean; message: string };

type JobsState = {
  jobs: JobView[] | null;
  /** Jobs currently animating out after being hidden. */
  leaving: ReadonlySet<number>;
  /** Hides a job right away and tells the server afterwards. Resolves to an error message, if any. */
  hide: (id: number) => Promise<string | null>;
  printer: Printer | null;
  hasMore: boolean;
  showMore: () => void;
  refresh: () => Promise<void>;
};

const PAGE_SIZE = 10;
const LEAVE_MS = 200; // the leave animation's duration

const JobsContext = createContext<JobsState | null>(null);

function toggled(set: ReadonlySet<number>, id: number, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** Polls the user's jobs and the printer status for the whole page. */
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  const refresh = useCallback(async () => {
    // One extra tells us whether there are more.
    const res = await fetch(`/api/jobs?limit=${limit + 1}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = await res.json();
    setJobs(body.jobs.slice(0, limit));
    setHasMore(body.jobs.length > limit);
    setPrinter(body.printer);
  }, [limit]);

  const hide = useCallback(async (id: number) => {
    setLeaving((s) => toggled(s, id, true));
    const animation = new Promise((resolve) => setTimeout(resolve, LEAVE_MS)).then(() => {
      setHidden((s) => toggled(s, id, true));
      setLeaving((s) => toggled(s, id, false));
    });
    const res = await fetch(`/api/jobs/${id}/hide`, { method: "POST" }).catch(() => null);
    await animation;
    if (res?.ok) return null;
    setHidden((s) => toggled(s, id, false));
    return (await res?.json().catch(() => null))?.error ?? "Utskriften kunde inte döljas.";
  }, []);

  const sending = jobs?.some((j) => j.status === "queued");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the fetch
    refresh();
    const timer = setInterval(refresh, sending ? 3_000 : 15_000);
    return () => clearInterval(timer);
  }, [refresh, sending]);

  return (
    <JobsContext.Provider
      value={{
        jobs: jobs && jobs.filter((j) => !hidden.has(j.id)),
        leaving,
        hide,
        printer,
        hasMore,
        showMore: () => setLimit((l) => l + 2 * PAGE_SIZE),
        refresh,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  return useContext(JobsContext)!;
}

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
