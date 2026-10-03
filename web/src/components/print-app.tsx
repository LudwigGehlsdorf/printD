"use client";

import { useCallback, useState } from "react";
import { JobHistory } from "@/components/job-history";
import { useJobs } from "@/components/jobs-context";
import { Notice } from "@/components/ui";
import { DropOverlay, FilePicker, UploadProgress, useWindowDrop } from "@/components/upload";
import { OtherWaiting, Panel, WaitingPanel } from "@/components/waiting";
import { Workspace, type PrintOptions, type Released, type Upload } from "@/components/workspace";

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

  const upload = useCallback(
    (file: File) => {
      setError(null);
      setNotice(null);
      if (file.size > maxUploadMb * 1024 * 1024) {
        setError(`Filen är större än ${maxUploadMb} MB.`);
        return;
      }
      setStage({ kind: "uploading", name: file.name, progress: 0 });

      // XMLHttpRequest rather than fetch, for upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => setStage({ kind: "uploading", name: file.name, progress: e.loaded / e.total });
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
      const form = new FormData();
      form.append("file", file);
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

    if (res?.ok && body.pin) {
      setStage({ kind: "released", upload, released: body });
    } else if (res?.ok) {
      setStage({ kind: "idle" });
      setNotice(`${upload.name} har skickats till skrivaren.`);
    } else {
      // On a validation error the upload is still there; otherwise the server has removed it.
      setStage(res?.status === 400 ? { kind: "ready", upload } : { kind: "idle" });
      setError(body?.error ?? "Utskriften misslyckades.");
    }
    refresh();
  }

  async function hideJob(id: number) {
    const failed = await hide(id);
    if (failed) setError(failed);
  }

  async function cancelJob(id: number) {
    await fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => null);
    refresh();
  }

  const dragging = useWindowDrop(stage.kind !== "uploading" && stage.kind !== "printing", upload);
  const waiting = jobs?.filter((j) => j.status === "held") ?? null;
  const shownPin = stage.kind === "released" ? stage.released.pin : null;

  return (
    <>
      {(error || notice) && (
        <div className="mb-6 space-y-3">
          {error && (
            <Notice error onClose={() => setError(null)}>
              {error}
            </Notice>
          )}
          {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
        </div>
      )}

      {/* The document on the left, what to do next on the right, at every step. */}
      <div className="grid grid-cols-1 gap-6 cols:grid-cols-[minmax(0,1fr)_18rem] lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        {stage.kind === "idle" || stage.kind === "uploading" ? (
          <>
            {stage.kind === "idle" ? (
              <div className="cols:self-start">
                <FilePicker accept={accept} maxUploadMb={maxUploadMb} onFile={upload} />
              </div>
            ) : (
              <UploadProgress name={stage.name} progress={stage.progress} />
            )}
            <aside>
              {securePrint ? (
                <WaitingPanel jobs={waiting} leaving={leaving} onHide={hideJob} />
              ) : (
                <Panel title="Utskrift direkt">
                  <p className="text-muted-foreground">Dokumenten skrivs ut så fort de skickas.</p>
                </Panel>
              )}
            </aside>
          </>
        ) : (
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

      {stage.kind !== "idle" && stage.kind !== "uploading" && waiting && waiting.some((j) => j.pin !== shownPin) && (
        <OtherWaiting jobs={waiting.filter((j) => j.pin !== shownPin)} leaving={leaving} onHide={hideJob} />
      )}

      <JobHistory jobs={jobs} leaving={leaving} hasMore={hasMore} onShowMore={showMore} onCancel={cancelJob} onHide={hideJob} />

      {dragging && <DropOverlay />}
    </>
  );
}
