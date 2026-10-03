"use client";

import type { ReactNode } from "react";
import { HideButton, formatDate } from "@/components/job-history";
import type { JobView } from "@/lib/jobs";

const IN_PANEL = 3;

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-5">
      <h2 className="text-base">{title}</h2>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** The user's PINs for jobs waiting in the printer. */
export function WaitingPanel({
  jobs,
  leaving,
  onHide,
}: {
  jobs: JobView[] | null;
  leaving: ReadonlySet<number>;
  onHide: (id: number) => void;
}) {
  return (
    <Panel title="Väntar i skrivaren">
      <p className="text-muted-foreground">Dina dokument hålls kvar i skrivaren tills du anger PIN-koden på skrivarens skärm.</p>
      {jobs?.length === 0 && (
        <p className="mt-4 rounded-md border border-dashed px-4 py-6 text-center text-muted-foreground">Inget väntar just nu.</p>
      )}
      {!!jobs?.length && (
        <>
          {/* The gap is padding inside each item, so it collapses along with the item. */}
          <ul className="mt-4 -mb-3">
            {jobs.slice(0, IN_PANEL).map((job) => (
              <li key={job.id}>
                <Collapse hidden={leaving.has(job.id)}>
                  <div className="pb-3">
                    <WaitingCard job={job} onHide={() => onHide(job.id)} />
                  </div>
                </Collapse>
              </li>
            ))}
          </ul>
          {jobs.length > IN_PANEL && (
            <p className="mt-3 text-muted-foreground">och {jobs.length - IN_PANEL} till, se Dina utskrifter nedan.</p>
          )}
        </>
      )}
    </Panel>
  );
}

/** Waiting jobs other than the one whose PIN is on screen, shown below the workspace. */
export function OtherWaiting({ jobs, leaving, onHide }: { jobs: JobView[]; leaving: ReadonlySet<number>; onHide: (id: number) => void }) {
  return (
    <section className="mt-16">
      <h2>Väntar också i skrivaren</h2>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {jobs.map((job) => (
          <li key={job.id}>
            <Collapse hidden={leaving.has(job.id)}>
              <WaitingCard job={job} onHide={() => onHide(job.id)} />
            </Collapse>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WaitingCard({ job, onHide }: { job: JobView; onHide: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background py-3 pr-2 pl-4">
      <div className="min-w-0">
        <p className="truncate font-medium" title={job.fileName}>
          {job.fileName}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</p>
      </div>
      <p className="shrink-0 text-right">
        <span className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">PIN</span>
        <span className="font-mono text-2xl leading-none tracking-wider">{job.pin}</span>
      </p>
      <HideButton confirm onHide={onHide} />
    </div>
  );
}

/** Fades and slides out while its height collapses, so the items below glide up. */
function Collapse({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={`grid transition-all duration-200 ease-out motion-reduce:transition-none ${
        hidden ? "pointer-events-none grid-rows-[0fr] translate-x-4 opacity-0" : "grid-rows-[1fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
