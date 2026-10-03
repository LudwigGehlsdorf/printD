"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const THUMB_WIDTH = 160;

/**
 * Thumbnails of every page. Clicking a page toggles whether it is printed.
 * Rendering happens in the browser so the Raspberry Pi does no extra work.
 */
export function PagePreview({
  url,
  pages,
  selected,
  onToggle,
  disabled = false,
}: {
  url: string;
  pages: number;
  selected: Set<number>;
  onToggle: (page: number) => void;
  disabled?: boolean;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        if (cancelled) return;
        const loading = pdfjs.getDocument({ url });
        task = loading;
        const loaded = await loading.promise;
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [url]);

  return (
    <ol
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))] sm:gap-4 sm:overflow-visible sm:px-0"
      aria-label="Sidor"
    >
      {Array.from({ length: pages }, (_, i) => i + 1).map((page) => {
        const included = selected.has(page);
        return (
          <li key={page} className="w-28 shrink-0 snap-start sm:w-auto">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(page)}
              aria-pressed={included}
              aria-label={`Sida ${page}${included ? "" : " (hoppas över)"}`}
              className="group block w-full text-left outline-none disabled:cursor-default"
            >
              <div
                className={`relative overflow-hidden rounded-sm border bg-white shadow-xs transition group-focus-visible:ring-[3px] group-focus-visible:ring-rosa-400/50 ${
                  included ? "" : "[&>canvas]:opacity-30"
                } ${disabled ? "" : "group-hover:border-rosa-background"}`}
              >
                {failed ? (
                  <div className="aspect-[1/1.414]" />
                ) : (
                  <Thumbnail doc={doc} page={page} />
                )}
                {!included && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-xs bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white">Hoppas över</span>
                  </span>
                )}
              </div>
              <span className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span
                  className={`flex size-3.5 items-center justify-center rounded-xs border text-[10px] leading-none ${
                    included ? "border-rosa-background bg-rosa-background text-rosa-foreground" : ""
                  }`}
                  aria-hidden
                >
                  {included ? "✓" : ""}
                </span>
                {page}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Thumbnail({ doc, page }: { doc: PDFDocumentProxy | null; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(1.414);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !visible || !canvas.current) return;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const pdfPage = await doc.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: (THUMB_WIDTH * window.devicePixelRatio) / base.width });
      const el = canvas.current;
      if (!el) return;
      el.width = viewport.width;
      el.height = viewport.height;
      setAspect(base.height / base.width);
      const render = pdfPage.render({ canvas: el, viewport });
      task = render;
      await render.promise.catch(() => {});
    })();
    return () => task?.cancel();
  }, [doc, page, visible]);

  return (
    <canvas
      ref={canvas}
      className="block w-full bg-white"
      style={{ aspectRatio: `1 / ${aspect}` }}
    />
  );
}
