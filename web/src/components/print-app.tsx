"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HideButton, JobHistory, formatDate, type Job } from "@/components/job-history";
import { useJobs } from "@/components/jobs-context";
import { ImageControls, ImagePreview } from "@/components/image-layout-editor";
import { PagePreview } from "@/components/page-preview";
import { Button, ChoiceGroup, Notice, Stepper, buttonClass } from "@/components/ui";
import { DEFAULT_LAYOUT, type ImageInfo, type ImageLayout } from "@/lib/image-layout";

/** `image` is set for pictures, which get layout controls instead of page selection. */
type Upload = { id: string; name: string; pages: number; image: ImageInfo | null };
type Released = { pin: string; panelUser: string };

type Stage =
  | { kind: "idle" }
  | { kind: "uploading"; name: string; progress: number }
  | { kind: "ready"; upload: Upload }
  | { kind: "printing"; upload: Upload }
  | { kind: "released"; upload: Upload; released: Released };

export function PrintApp({
  accept,
  maxUploadMb,
  maxCopies,
  securePrint,
}: {
  accept: string;
  maxUploadMb: number;
  maxCopies: number;
  securePrint: boolean;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { jobs, leaving, hide, hasMore, showMore, refresh } = useJobs();
  const waiting = jobs?.filter((j) => j.status === "held" && j.pin) ?? [];

  const upload = useCallback(
    (file: File) => {
      setError(null);
      setNotice(null);
      if (file.size > maxUploadMb * 1024 * 1024) {
        setError(`Filen är större än ${maxUploadMb} MB.`);
        return;
      }
      setStage({ kind: "uploading", name: file.name, progress: 0 });

      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setStage({ kind: "uploading", name: file.name, progress: e.loaded / e.total });
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          setStage({ kind: "ready", upload: xhr.response });
        } else {
          setStage({ kind: "idle" });
          setError(xhr.response?.error ?? "Uppladdningen misslyckades.");
        }
      };
      xhr.onerror = () => {
        setStage({ kind: "idle" });
        setError("Uppladdningen misslyckades. Kontrollera din anslutning.");
      };
      xhr.send(form);
    },
    [maxUploadMb],
  );

  async function print(upload: Upload, options: PrintOptions) {
    setError(null);
    setStage({ kind: "printing", upload });
    const res = await fetch("/api/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, ...options }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);

    if (res?.ok) {
      if (body.pin) {
        setStage({ kind: "released", upload, released: { pin: body.pin, panelUser: body.panelUser } });
      } else {
        setStage({ kind: "idle" });
        setNotice(`${upload.name} har skickats till skrivaren.`);
      }
    } else {
      // The server deletes the upload once it has been sent, even if the printer rejected it.
      setStage(res?.status === 400 ? { kind: "ready", upload } : { kind: "idle" });
      setError(body?.error ?? "Utskriften misslyckades.");
    }
    refresh();
  }

  async function hideJob(id: number) {
    const failed = await hide(id);
    if (failed) setError(failed);
  }

  const canDrop = stage.kind !== "uploading" && stage.kind !== "printing";
  const dragging = useWindowDrop(canDrop, upload);
  const hasFile = stage.kind === "ready" || stage.kind === "printing" || stage.kind === "released";
  const shownPin = stage.kind === "released" ? stage.released.pin : null;
  const otherWaiting = waiting.filter((j) => j.pin !== shownPin);

  return (
    <>
      {(error || notice) && (
        <div className="mb-6 space-y-3">
          {error && (
            <Notice tone="error" onClose={() => setError(null)}>
              {error}
            </Notice>
          )}
          {notice && (
            <Notice tone="info" onClose={() => setNotice(null)}>
              {notice}
            </Notice>
          )}
        </div>
      )}

      {/* Left: the document. Right: what to do next. The columns stay put through every step. */}
      <div className="grid grid-cols-1 gap-6 cols:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {stage.kind === "idle" && (
          <>
            <div className="cols:self-start">
              <FilePicker accept={accept} maxUploadMb={maxUploadMb} onFile={upload} />
            </div>
            <aside>
              {securePrint ? (
                <WaitingPanel jobs={waiting} leaving={leaving} loading={jobs === null} onHide={hideJob} />
              ) : (
                <Panel title="Utskrift direkt">
                  <p className="text-muted-foreground">Dokumenten skrivs ut så fort de skickas.</p>
                </Panel>
              )}
            </aside>
          </>
        )}

        {stage.kind === "uploading" && (
          <>
            <div className="flex min-h-64 flex-col justify-center rounded-md border bg-card p-6 cols:self-start">
              <p className="truncate font-medium">{stage.name}</p>
              <p className="mt-0.5 text-muted-foreground">
                {stage.progress < 1 ? `Laddar upp… ${Math.round(stage.progress * 100)} %` : "Förbereder dokumentet…"}
              </p>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full bg-rosa-background transition-all ${stage.progress >= 1 ? "animate-pulse" : ""}`}
                  style={{ width: `${Math.max(stage.progress, 0.02) * 100}%` }}
                />
              </div>
            </div>
            <aside>{securePrint && <WaitingPanel jobs={waiting} leaving={leaving} loading={jobs === null} onHide={hideJob} />}</aside>
          </>
        )}

        {hasFile && (
          <Workspace
            key={stage.upload.id}
            accept={accept}
            upload={stage.upload}
            maxCopies={maxCopies}
            busy={stage.kind === "printing"}
            released={stage.kind === "released" ? stage.released : null}
            onReplace={upload}
            onReset={() => setStage({ kind: "idle" })}
            onPrint={(options) => print(stage.upload, options)}
          />
        )}
      </div>

      {hasFile && otherWaiting.length > 0 && (
        <section className="mt-16">
          <h2>Väntar också i skrivaren</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {otherWaiting.map((job) => (
              <li key={job.id}>
                <Leaving leaving={leaving.has(job.id)}>
                  <WaitingCard job={job} onHide={() => hideJob(job.id)} />
                </Leaving>
              </li>
            ))}
          </ul>
        </section>
      )}

      <JobHistory
        jobs={jobs}
        leaving={leaving}
        hasMore={hasMore}
        onShowMore={showMore}
        onCancel={async (id) => {
          await fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => null);
          refresh();
        }}
        onHide={hideJob}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[2px]">
          <div className="rounded-md border-2 border-dashed border-rosa-background px-10 py-8 text-center">
            <p className="font-display text-2xl font-semibold">Släpp filen här</p>
            <p className="mt-1 text-muted-foreground">PDF, bilder, Word, Excel och PowerPoint</p>
          </div>
        </div>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-5">
      <h2 className="text-base">{title}</h2>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ---------------------------------- Waiting -------------------------------- */

/** Fades and slides its content out while collapsing its height, so the items below glide up. */
function Leaving({ leaving, children }: { leaving: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={leaving || undefined}
      className={`grid transition-all duration-200 ease-out motion-reduce:transition-none ${
        leaving ? "pointer-events-none grid-rows-[0fr] translate-x-4 opacity-0" : "grid-rows-[1fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const WAITING_IN_PANEL = 3;

function WaitingPanel({
  jobs,
  leaving,
  loading,
  onHide,
}: {
  jobs: Job[];
  leaving: ReadonlySet<number>;
  loading: boolean;
  onHide: (id: number) => void;
}) {
  const hidden = jobs.length - WAITING_IN_PANEL;
  return (
    <Panel title="Väntar i skrivaren">
      <p className="text-muted-foreground">
        Dina dokument hålls kvar i skrivaren tills du anger PIN-koden på skrivarens skärm.
      </p>
      {loading ? null : jobs.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed px-4 py-6 text-center text-muted-foreground">
          Inget väntar just nu.
        </p>
      ) : (
        <>
          <ul className="mt-4 -mb-3">
            {jobs.slice(0, WAITING_IN_PANEL).map((job) => (
              <li key={job.id}>
                <Leaving leaving={leaving.has(job.id)}>
                  <div className="pb-3">
                    <WaitingCard job={job} onHide={() => onHide(job.id)} />
                  </div>
                </Leaving>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-3 text-muted-foreground">
              och {hidden} till – se Dina utskrifter nedan.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function WaitingCard({ job, onHide }: { job: Job; onHide: () => void }) {
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

/* ------------------------------- File picking ------------------------------ */

function FilePicker({
  accept,
  maxUploadMb,
  onFile,
}: {
  accept: string;
  maxUploadMb: number;
  onFile: (file: File) => void;
}) {
  return (
    <div className="flex flex-col items-start justify-center gap-4 rounded-md border bg-card p-6 sm:min-h-64">
      <div>
        <h2>Skriv ut ett dokument</h2>
        <p className="mt-1 text-muted-foreground">
          PDF, bilder, Word, Excel och PowerPoint · max {maxUploadMb} MB
        </p>
      </div>
      <FileButton accept={accept} onFile={onFile} variant="rosa" size="lg">
        Välj fil
      </FileButton>
      <p className="hidden text-xs text-muted-foreground sm:block">Du kan också släppa filen var som helst på sidan.</p>
    </div>
  );
}

function FileButton({
  accept,
  onFile,
  variant,
  size,
  children,
}: {
  accept: string;
  onFile: (file: File) => void;
  variant: "rosa" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  children: React.ReactNode;
}) {
  return (
    <label className={buttonClass(variant, size, "cursor-pointer has-focus-visible:ring-[3px]")}>
      {children}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Shows an overlay while a file is dragged over the window and uploads it on drop. */
function useWindowDrop(enabled: boolean, onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [enabled, onFile]);

  return dragging && enabled;
}

/* -------------------------------- Workspace -------------------------------- */

type PrintOptions = {
  copies: number;
  duplex: boolean;
  color: boolean;
  pageRange: string;
  layout: ImageLayout | null;
};

function allPages(count: number) {
  return new Set(Array.from({ length: count }, (_, i) => i + 1));
}

/** Renders both grid columns: the pages on the left, settings or the PIN on the right. */
function Workspace({
  accept,
  upload,
  maxCopies,
  busy,
  released,
  onReplace,
  onReset,
  onPrint,
}: {
  accept: string;
  upload: Upload;
  maxCopies: number;
  busy: boolean;
  released: Released | null;
  onReplace: (file: File) => void;
  onReset: () => void;
  onPrint: (options: PrintOptions) => void;
}) {
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState(upload.pages > 1);
  const [color, setColor] = useState(false);
  const [selected, setSelected] = useState(() => allPages(upload.pages));
  const [layout, setLayout] = useState<ImageLayout>(DEFAULT_LAYOUT);
  const image = upload.image;

  const pageCount = selected.size;
  const sheets = image ? copies : Math.ceil(pageCount / (duplex ? 2 : 1)) * copies;
  const allSelected = pageCount === upload.pages;

  const printAction = (
    <>
      <p className="mb-2 text-muted-foreground">
        {image ? (
          <>
            {layout.perSheet} {layout.perSheet === 1 ? "bild" : "bilder"} per ark · {sheets} ark
          </>
        ) : (
          <>
            {pageCount} {pageCount === 1 ? "sida" : "sidor"}
            {copies > 1 && ` × ${copies} ex`} · {sheets} ark
          </>
        )}
      </p>
      <Button
        size="lg"
        className="w-full"
        disabled={busy || pageCount === 0}
        onClick={() =>
          onPrint({
            copies,
            duplex: !image && duplex,
            color,
            pageRange: image || allSelected ? "" : toPageRange(selected),
            layout: image ? layout : null,
          })
        }
      >
        {busy ? "Skickar…" : "Skriv ut"}
      </Button>
    </>
  );

  function toggle(page: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  }

  return (
    <>
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate" title={upload.name}>
              {upload.name}
            </h2>
            <p className="text-muted-foreground">
              {image
                ? `Bild · ${image.width} × ${image.height} px`
                : allSelected
                ? `${upload.pages} ${upload.pages === 1 ? "sida" : "sidor"}`
                : `${pageCount} av ${upload.pages} sidor valda`}
              {!image && !allSelected && !released && (
                <>
                  {" · "}
                  <button
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setSelected(allPages(upload.pages))}
                  >
                    Välj alla
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/uploads/${upload.id}/pdf${image ? `?layout=${encodeURIComponent(JSON.stringify(layout))}` : ""}`}
              target="_blank"
              className={buttonClass("ghost", "sm")}
            >
              Öppna PDF
            </a>
            {!released && (
              <FileButton accept={accept} onFile={onReplace} variant="outline" size="sm">
                Byt fil
              </FileButton>
            )}
          </div>
        </div>
        {image ? (
          <ImagePreview
            src={`/api/uploads/${upload.id}/image`}
            image={image}
            layout={layout}
            onChange={setLayout}
            disabled={busy || released !== null}
          />
        ) : (
          <>
            {upload.pages > 1 && !released && (
              <p className="mb-3 text-xs text-muted-foreground">Klicka på en sida för att hoppa över den.</p>
            )}
            <PagePreview
              url={`/api/uploads/${upload.id}/pdf`}
              pages={upload.pages}
              selected={selected}
              onToggle={toggle}
              disabled={busy || released !== null || upload.pages === 1}
            />
          </>
        )}
      </section>

      <aside className="cols:sticky cols:top-6 cols:self-start">
        {released ? (
          <PinPanel released={released} fileName={upload.name} onReset={onReset} />
        ) : (
          <div className="flex flex-col gap-6 rounded-md border bg-card p-5">
            {image && <ImageControls image={image} layout={layout} onChange={setLayout} />}
            <Stepper label="Kopior" value={copies} min={1} max={maxCopies} onChange={setCopies} />
            <ChoiceGroup
              label="Färg"
              name="color"
              value={color ? "color" : "mono"}
              onChange={(v) => setColor(v === "color")}
              options={[
                { value: "mono", label: "Svartvit" },
                { value: "color", label: "Färg" },
              ]}
            />
            {!image && (
              <ChoiceGroup
                label="Utskrift"
                name="sides"
                value={duplex ? "duplex" : "simplex"}
                onChange={(v) => setDuplex(v === "duplex")}
                options={[
                  { value: "simplex", label: "Enkelsidig" },
                  { value: "duplex", label: "Dubbelsidig" },
                ]}
              />
            )}
            <div className="hidden cols:block">{printAction}</div>
          </div>
        )}
      </aside>

      {/*
        Phones: the print button sticks to the bottom of the screen while the document and its
        settings are on screen. It stays in the flow, so it never covers the content below.
      */}
      {!released && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur cols:hidden">
          {printAction}
        </div>
      )}
    </>
  );
}

function PinPanel({ released, fileName, onReset }: { released: Released; fileName: string; onReset: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  // On phones the panel sits below the page thumbnails, so bring it into view.
  useEffect(() => {
    if (window.matchMedia("(width < 44rem)").matches) {
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div ref={panel} className="scroll-mt-4 rounded-md border bg-card p-5" role="status">
      <h2>Klart att hämta</h2>
      <p className="mt-1 text-muted-foreground">Dokumentet väntar i skrivaren.</p>

      <p className="mt-6 text-sm font-medium">PIN-kod</p>
      <p className="mt-4 flex gap-2 justify-center" aria-label={`PIN-kod ${released.pin.split("").join(" ")}`}>
        {released.pin.split("").map((digit, i) => (
          <span
            key={i}
            aria-hidden
            className="flex h-14 w-11 items-center justify-center rounded-md border bg-background font-mono text-3xl"
          >
            {digit}
          </span>
        ))}
      </p>

      <ol className="mt-4 space-y-2">
        {[
          <>
            Tryck på <b className="font-medium">Secure Print</b> på skrivarens skärm.
          </>,
          <>
            Välj <b className="font-medium break-all">{fileName}</b> under{" "}
            <b className="font-mono font-medium">{released.panelUser}</b>.
          </>,
          <>
            Ange PIN-koden och tryck på <b className="font-medium">Apply</b>.
          </>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="font-mono text-muted-foreground">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <Button variant="outline" className="mt-6 w-full" onClick={onReset}>
        Skriv ut en fil till
      </Button>
    </div>
  );
}

/** {1,2,3,5,7,8} → "1-3,5,7-8" (CUPS page-ranges syntax). */
function toPageRange(pages: Set<number>): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    ranges.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
  }
  return ranges.join(",");
}
