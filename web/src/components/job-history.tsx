"use client";

import { useEffect, useState } from "react";
import { Button, StatusDot } from "@/components/ui";

export type Job = {
  id: number;
  fileName: string;
  pages: number;
  copies: number;
  duplex: boolean;
  color: boolean;
  pageRange: string | null;
  status: "queued" | "printing" | "held" | "sent" | "done" | "cancelled" | "failed";
  error: string | null;
  pin: string | null;
  createdAt: number;
};

const STATUS: Record<Job["status"], { label: string; tone: Parameters<typeof StatusDot>[0]["tone"] }> = {
  queued: { label: "I kö", tone: "warning" },
  printing: { label: "Skickas", tone: "warning" },
  // Secure Print jobs: delivered to the printer, waiting for the PIN. We cannot see the release,
  // so "delivered" is the final state we report.
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
  jobs: Job[] | null;
  leaving: ReadonlySet<number>;
  hasMore: boolean;
  onShowMore: () => void;
  onCancel: (id: number) => void;
  onHide: (id: number) => void;
}) {
  return (
    <section className="mt-16">
      <h2>Dina utskrifter</h2>
      {jobs === null ? (
        <p className="mt-4 text-muted-foreground">Hämtar…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-4 text-muted-foreground">Du har inte skrivit ut något än.</p>
      ) : (
        <>
          <table className="mt-4 block w-full text-left sm:table sm:table-fixed">
            <thead className="sr-only sm:not-sr-only">
              <tr className="border-b text-xs text-muted-foreground">
                <th className="w-32 py-2 pr-4 font-medium">Datum</th>
                <th className="py-2 pr-4 font-medium">Fil</th>
                <th className="hidden w-[30%] py-2 pr-4 font-medium md:table-cell">Inställningar</th>
                <th className="w-56 py-2 font-medium">Status</th>
                <th className="w-12 py-2">
                  <span className="sr-only">Åtgärder</span>
                </th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {jobs.map((job) => {
                const status = STATUS[job.status];
                const active = job.status === "queued" || job.status === "printing";
                return (
                  <tr
                    key={job.id}
                    className={`flex flex-wrap items-center gap-x-3 border-b py-3 transition-opacity duration-200 motion-reduce:transition-none sm:table-row sm:py-0 ${
                      leaving.has(job.id) ? "pointer-events-none opacity-0" : ""
                    }`}
                  >
                    <td className="order-2 w-full text-xs text-muted-foreground sm:w-auto sm:truncate sm:py-3 sm:pr-4 sm:text-sm">
                      {formatDate(job.createdAt)}
                      <span className="sm:hidden"> · {describe(job)}</span>
                    </td>
                    <td className="order-1 min-w-0 flex-1 truncate font-medium sm:py-3 sm:pr-4" title={job.fileName}>
                      {job.fileName}
                    </td>
                    <td className="hidden truncate py-3 pr-4 text-muted-foreground md:table-cell" title={describe(job)}>
                      {describe(job)}
                    </td>
                    <td className="order-1 sm:py-3">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span title={status.label} className="flex">
                          <StatusDot tone={status.tone} />
                        </span>
                        {/* Phones show only the dot, to leave room for the file name. */}
                        <span className="sr-only sm:not-sr-only">{status.label}</span>
                        {job.status === "held" && job.pin && (
                          <span className="font-mono text-muted-foreground">{job.pin}</span>
                        )}
                      </span>
                    </td>
                    <td className="order-1 -mr-2 sm:py-2 sm:text-right">
                      <span className="flex items-center justify-end gap-1">
                        {active ? (
                          <Button variant="ghost" size="sm" onClick={() => onCancel(job.id)}>
                            Avbryt
                          </Button>
                        ) : (
                          <HideButton
                            // Hiding a job whose PIN is still shown also hides the PIN, so ask first.
                            confirm={job.pin !== null}
                            onHide={() => onHide(job.id)}
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
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

/** "✕"; with confirm, the first click turns it into "Dölj?" for a few seconds. */
export function HideButton({ confirm, onHide }: { confirm: boolean; onHide: () => void }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(timer);
  }, [asking]);

  if (asking) {
    return (
      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400" onClick={onHide}>
        Dölj?
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label="Dölj från listan"
      title="Dölj från listan"
      onClick={() => (confirm ? setAsking(true) : onHide())}
    >
      ✕
    </Button>
  );
}

function describe(job: Job) {
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
