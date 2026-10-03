"use client";

import { useEffect, useRef, useState } from "react";
import { ImageControls, ImagePreview } from "@/components/image-layout-editor";
import { PagePreview } from "@/components/page-preview";
import { Button, ChoiceGroup, Stepper, buttonClass } from "@/components/ui";
import { FileButton } from "@/components/upload";
import { DEFAULT_LAYOUT, type ImageInfo, type ImageLayout } from "@/lib/image-layout";

/** `image` is set for pictures, which get layout controls instead of page selection. */
export type Upload = { id: string; name: string; pages: number; image: ImageInfo | null };
export type Released = { pin: string; username: string };
export type PrintOptions = { copies: number; duplex: boolean; color: boolean; pageRange: string | null; layout: ImageLayout };

const allPages = (count: number) => new Set(Array.from({ length: count }, (_, i) => i + 1));

/** Both columns of the page while a file is open: the document, and its settings or PIN. */
export function Workspace({
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
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const { image } = upload;
  const locked = busy || !!released;

  const allSelected = selected.size === upload.pages;
  const sheets = image ? copies : Math.ceil(selected.size / (duplex ? 2 : 1)) * copies;
  const summary = image
    ? `${layout.perSheet} ${layout.perSheet === 1 ? "bild" : "bilder"} per ark · ${sheets} ark`
    : `${selected.size} ${selected.size === 1 ? "sida" : "sidor"}${copies > 1 ? ` × ${copies} ex` : ""} · ${sheets} ark`;

  const printAction = (
    <>
      <p className="mb-2 text-muted-foreground">{summary}</p>
      <Button
        size="lg"
        className="w-full"
        disabled={busy || selected.size === 0}
        onClick={() => onPrint({ copies, duplex, color, layout, pageRange: allSelected ? null : toPageRange(selected) })}
      >
        {busy ? "Skickar…" : "Skriv ut"}
      </Button>
    </>
  );

  function toggle(page: number) {
    const next = new Set(selected);
    if (!next.delete(page)) next.add(page);
    setSelected(next);
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
                  : `${selected.size} av ${upload.pages} sidor valda`}
              {!image && !allSelected && !released && (
                <>
                  {" · "}
                  <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setSelected(allPages(upload.pages))}>
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
              className={buttonClass({ variant: "ghost", size: "sm" })}
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
          <ImagePreview src={`/api/uploads/${upload.id}/image`} image={image} layout={layout} onChange={setLayout} disabled={locked} />
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
              disabled={locked || upload.pages === 1}
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
            <Stepper label="Kopior" value={copies} max={maxCopies} onChange={setCopies} />
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

      {/* On phones the button sticks to the bottom of the screen but stays in the flow, so it
          never covers the content below. */}
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

  // On phones the panel is below the document, out of view.
  useEffect(() => {
    if (matchMedia("(width < 44rem)").matches) panel.current!.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div ref={panel} role="status" className="scroll-mt-4 rounded-md border bg-card p-5">
      <h2>Klart att hämta</h2>
      <p className="mt-1 text-muted-foreground">Dokumentet väntar i skrivaren.</p>

      <p className="mt-6 text-sm font-medium">PIN-kod</p>
      <p className="mt-4 flex justify-center gap-2" aria-label={`PIN-kod ${released.pin.split("").join(" ")}`}>
        {[...released.pin].map((digit, i) => (
          <span key={i} aria-hidden className="flex h-14 w-11 items-center justify-center rounded-md border bg-background font-mono text-3xl">
            {digit}
          </span>
        ))}
      </p>

      <ol className="mt-4 list-decimal space-y-2 pl-6 marker:font-mono marker:text-muted-foreground">
        <li>
          Tryck på <b className="font-medium">Secure Print</b> på skrivarens skärm.
        </li>
        <li>
          Välj <b className="font-medium break-all">{fileName}</b> under <b className="font-mono font-medium">{released.username}</b>.
        </li>
        <li>
          Ange PIN-koden och tryck på <b className="font-medium">Apply</b>.
        </li>
      </ol>

      <Button variant="outline" className="mt-6 w-full" onClick={onReset}>
        Skriv ut en fil till
      </Button>
    </div>
  );
}

/** {1,2,3,5,7,8} → "1-3,5,7-8" */
function toPageRange(pages: Set<number>) {
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    ranges.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
  }
  return ranges.join(",");
}
