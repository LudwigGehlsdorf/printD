"use client";

import { useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

export function FilePicker({ accept, maxUploadMb, onFile }: { accept: string; maxUploadMb: number; onFile: (file: File) => void }) {
  return (
    <div className="flex flex-col items-start justify-center gap-4 rounded-md border bg-card p-6 sm:min-h-64">
      <div>
        <h2>Skriv ut ett dokument</h2>
        <p className="mt-1 text-muted-foreground">PDF, bilder, Word, Excel och PowerPoint · max {maxUploadMb} MB</p>
      </div>
      <FileButton accept={accept} onFile={onFile} size="lg">
        Välj fil
      </FileButton>
      <p className="hidden text-xs text-muted-foreground sm:block">Du kan också släppa filen var som helst på sidan.</p>
    </div>
  );
}

export function UploadProgress({ name, progress }: { name: string; progress: number }) {
  return (
    <div className="flex min-h-64 flex-col justify-center rounded-md border bg-card p-6 cols:self-start">
      <p className="truncate font-medium">{name}</p>
      <p className="mt-0.5 text-muted-foreground">
        {progress < 1 ? `Laddar upp… ${Math.round(progress * 100)} %` : "Förbereder dokumentet…"}
      </p>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full bg-rosa-background transition-all ${progress === 1 ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(progress, 0.02) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function FileButton({
  accept,
  onFile,
  variant = "rosa",
  size,
  children,
}: {
  accept: string;
  onFile: (file: File) => void;
  variant?: "rosa" | "outline";
  size?: "sm" | "lg";
  children: ReactNode;
}) {
  return (
    <label className={buttonClass({ variant, size }, "cursor-pointer has-focus-visible:ring-[3px]")}>
      {children}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Lets a file be dropped anywhere on the page. Returns whether one is being dragged over it. */
export function useWindowDrop(enabled: boolean, onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // dragenter/dragleave fire for every element the pointer crosses, so count them.
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const handlers = {
      dragenter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth++;
        setDragging(true);
      },
      dragleave: () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) setDragging(false);
      },
      dragover: (e: DragEvent) => {
        if (hasFiles(e)) e.preventDefault();
      },
      drop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        setDragging(false);
        onFile(e.dataTransfer!.files[0]);
      },
    };
    for (const [event, handler] of Object.entries(handlers)) window.addEventListener(event, handler as EventListener);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) window.removeEventListener(event, handler as EventListener);
    };
  }, [enabled, onFile]);

  return dragging && enabled;
}

export function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[2px]">
      <div className="rounded-md border-2 border-dashed border-rosa-background px-10 py-8 text-center">
        <p className="font-display text-2xl font-semibold">Släpp filen här</p>
        <p className="mt-1 text-muted-foreground">PDF, bilder, Word, Excel och PowerPoint</p>
      </div>
    </div>
  );
}
