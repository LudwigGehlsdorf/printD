"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const THUMB_WIDTH = 160;

/** Page thumbnails, drawn with pdf.js. Clicking a page toggles whether it is printed. */
export function PagePreview({
  url,
  pages,
  selected,
  onToggle,
  disabled,
}: {
  url: string;
  pages: number;
  selected: Set<number>;
  onToggle: (page: number) => void;
  disabled: boolean;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let loading: { destroy: () => Promise<void> } | undefined;
    import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({ url });
      loading = task;
      setDoc(await task.promise);
    });
    return () => void loading?.destroy();
  }, [url]);

  return (
    <ol
      aria-label="Sidor"
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))] sm:gap-4 sm:overflow-visible sm:px-0"
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
              aria-label={`Sida ${page}`}
              className="group block w-full text-left outline-none disabled:cursor-default"
            >
              <div
                className={`relative overflow-hidden rounded-sm border bg-white shadow-xs transition group-focus-visible:ring-[3px] group-focus-visible:ring-rosa-400/50 ${
                  included ? "" : "[&>canvas]:opacity-30"
                } ${disabled ? "" : "group-hover:border-rosa-background"}`}
              >
                <Thumbnail doc={doc} page={page} />
                {!included && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-xs bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white">Hoppas över</span>
                  </span>
                )}
              </div>
              <span className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={`flex size-3.5 items-center justify-center rounded-xs border text-[10px] leading-none ${
                    included ? "border-rosa-background bg-rosa-background text-rosa-foreground" : ""
                  }`}
                >
                  {included && "✓"}
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

/** Renders its page once it scrolls near the screen, so long documents stay quick. */
function Thumbnail({ doc, page }: { doc: PDFDocumentProxy | null; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(1.414);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(canvas.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !visible) return;
    let render: RenderTask | undefined;
    doc.getPage(page).then((pdfPage) => {
      const { width, height } = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: (THUMB_WIDTH * devicePixelRatio) / width });
      const el = canvas.current!;
      el.width = viewport.width;
      el.height = viewport.height;
      setAspect(height / width);
      render = pdfPage.render({ canvas: el, viewport });
      render.promise.catch(() => {}); // rejects when cancelled
    });
    return () => render?.cancel();
  }, [doc, page, visible]);

  return <canvas ref={canvas} className="block w-full bg-white" style={{ aspectRatio: `1 / ${aspect}` }} />;
}
