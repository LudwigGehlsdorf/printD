"use client";

import { useEffect, useState } from "react";
import { Button, StatusDot, type Tone } from "@/components/ui";
import type { JobView } from "@/lib/jobs";

const STATUS: Record<JobView["status"], { label: string; tone: Tone }> = {
  queued: { label: "Skickas", tone: "warning" },
  // We can't see when a Secure Print job is released, so reaching the printer is the end.
  held: { label: "Skickad till skrivaren", tone: "success" },
  sent: { label: "Skickad till skrivaren", tone: "success" },
  done: { label: "Klar", tone: "success" },
  cancelled: { label: "Avbruten", tone: "muted" },
  failed: { label: "Misslyckades", tone: "error" },
};

export function JobHistory({
  jobs,
  leaving,
  hasMore,
  onShowMore,
  onCancel,
  onHide,
}: {
  jobs: JobView[] | null;
  leaving: ReadonlySet<number>;
  hasMore: boolean;
  onShowMore: () => void;
  onCancel: (id: number) => void;
  onHide: (id: number) => void;
}) {
  return (
    <section className="mt-16">
      <h2>Dina utskrifter</h2>
      {!jobs ? (
        <p className="mt-4 text-muted-foreground">Hämtar…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-4 text-muted-foreground">Du har inte skrivit ut något än.</p>
      ) : (
        <>
          {/* A table on wide screens; on phones each row becomes a two-line card. */}
          <table className="mt-4 block w-full text-left sm:table sm:table-fixed">
            <thead className="sr-only sm:not-sr-only">
              <tr className="border-b text-xs text-muted-foreground">
                <th className="w-32 py-2 pr-4 font-medium">Datum</th>
                <th className="py-2 pr-4 font-medium">Fil</th>
                <th className="hidden w-[30%] py-2 pr-4 font-medium md:table-cell">Inställningar</th>
                <th className="w-56 py-2 font-medium">Status</th>
                <th className="w-12 py-2" />
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  leaving={leaving.has(job.id)}
                  onCancel={() => onCancel(job.id)}
                  onHide={() => onHide(job.id)}
                />
              ))}
            </tbody>
          </table>
          {hasMore && (
            <Button variant="outline" className="mt-4" onClick={onShowMore}>
              Visa fler
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function JobRow({
  job,
  leaving,
  onCancel,
  onHide,
}: {
  job: JobView;
  leaving: boolean;
  onCancel: () => void;
  onHide: () => void;
}) {
  const status = STATUS[job.status];
  const settings = describe(job);
  return (
    <tr
      className={`flex flex-wrap items-center gap-x-3 border-b py-3 transition-opacity duration-200 motion-reduce:transition-none sm:table-row sm:py-0 ${
        leaving ? "pointer-events-none opacity-0" : ""
      }`}
    >
      <td className="order-2 w-full text-xs text-muted-foreground sm:w-auto sm:truncate sm:py-3 sm:pr-4 sm:text-sm">
        {formatDate(job.createdAt)}
        <span className="sm:hidden"> · {settings}</span>
      </td>
      <td className="order-1 min-w-0 flex-1 truncate font-medium sm:py-3 sm:pr-4" title={job.fileName}>
        {job.fileName}
      </td>
      <td className="hidden truncate py-3 pr-4 text-muted-foreground md:table-cell" title={settings}>
        {settings}
      </td>
      <td className="order-1 sm:py-3">
        <span className="flex items-center gap-2 whitespace-nowrap" title={status.label}>
          <StatusDot tone={status.tone} />
          <span className="sr-only sm:not-sr-only">{status.label}</span>
          {job.pin && <span className="font-mono text-muted-foreground">{job.pin}</span>}
        </span>
      </td>
      <td className="order-1 -mr-2 sm:py-2 sm:text-right">
        {job.status === "queued" ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Avbryt
          </Button>
        ) : (
          <HideButton confirm={job.pin !== null} onHide={onHide} />
        )}
      </td>
    </tr>
  );
}

/** A ✕ that hides a job. With `confirm` it first turns into "Dölj?", since hiding also hides the PIN. */
export function HideButton({ confirm, onHide }: { confirm: boolean; onHide: () => void }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(timer);
  }, [asking]);

  return asking ? (
    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400" onClick={onHide}>
      Dölj?
    </Button>
  ) : (
    <Button variant="ghost" size="icon" aria-label="Dölj från listan" title="Dölj från listan" onClick={() => (confirm ? setAsking(true) : onHide())}>
      ✕
    </Button>
  );
}

function describe(job: JobView) {
  return [
    job.pageRange ? `sid ${job.pageRange.replaceAll(",", ", ")}` : `${job.pages} sid`,
    `${job.copies} ex`,
    job.color ? "färg" : "svartvit",
    job.duplex ? "dubbelsidig" : "enkelsidig",
  ].join(" · ");
}

export function formatDate(ms: number) {
  const date = new Date(ms);
  const time = date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return `Idag ${time}`;
  return `${date.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} ${time}`;
}
