"use client";

import { useRef, useState } from "react";
import { ChoiceGroup } from "@/components/ui";
import { CUSTOM_PERCENT, layoutImage, type ImageInfo, type ImageLayout, type ImageScale } from "@/shared/image-layout";

const percent = (value: number, total: number) => `${(value / total) * 100}%`;

const box = (r: { x: number; y: number; w: number; h: number }, width: number, height: number) => ({
  left: percent(r.x, width),
  top: percent(r.y, height),
  width: percent(r.w, width),
  height: percent(r.h, height),
});

/** The A4 sheet as it will be printed. The image can be dragged to move or crop it. */
export function ImagePreview({
  src,
  image,
  layout,
  onChange,
  disabled,
}: {
  src: string;
  image: ImageInfo;
  layout: ImageLayout;
  onChange: (layout: ImageLayout) => void;
  disabled: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const page = layoutImage(image, layout);
  const cell = page.cells[0];
  // Free space in the cell (negative when the image overflows it).
  const slackX = cell.w - cell.image.w;
  const slackY = cell.h - cell.image.h;
  const canMoveX = Math.abs(slackX) > 0.5;
  const canMoveY = Math.abs(slackY) > 0.5;
  const movable = !disabled && (canMoveX || canMoveY);

  function startDrag(e: React.PointerEvent<HTMLElement>) {
    if (!movable) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const pointsPerPixel = page.width / sheet.current!.clientWidth;
    const start = { x: e.clientX, y: e.clientY, offsetX: layout.offsetX, offsetY: layout.offsetY };
    const clamp = (n: number) => Math.min(1, Math.max(-1, n));

    // Moving the image by half the slack changes the offset by 1.
    const move = (ev: PointerEvent) =>
      onChange({
        ...layout,
        offsetX: canMoveX ? clamp(start.offsetX + (2 * (ev.clientX - start.x) * pointsPerPixel) / slackX) : layout.offsetX,
        offsetY: canMoveY ? clamp(start.offsetY + (2 * (ev.clientY - start.y) * pointsPerPixel) / slackY) : layout.offsetY,
      });
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
  }

  return (
    <div>
      <div
        ref={sheet}
        aria-label="Förhandsvisning av utskriften"
        className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xs border bg-white shadow-sm"
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
      >
        {!loaded && <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">Laddar bild…</p>}
        <div
          className="pointer-events-none absolute border border-dashed border-zinc-300"
          style={box(page.printable, page.width, page.height)}
        />
        {page.cells.map((c, i) => (
          <div
            key={i}
            onPointerDown={startDrag}
            className={`absolute touch-none overflow-hidden ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
            style={box(c, page.width, page.height)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a private upload, already resized */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={() => setLoaded(true)}
              className={`absolute max-w-none select-none transition-opacity duration-300 ${loaded ? "" : "opacity-0"}`}
              style={box({ ...c.image, x: c.image.x - c.x, y: c.image.y - c.y }, c.w, c.h)}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {movable ? "Dra i bilden för att flytta den." : "Den streckade linjen visar skrivarens marginal."}
        {!disabled && (layout.offsetX !== 0 || layout.offsetY !== 0) && (
          <button
            className="ml-1 underline underline-offset-2 hover:text-foreground"
            onClick={() => onChange({ ...layout, offsetX: 0, offsetY: 0 })}
          >
            Centrera
          </button>
        )}
      </p>
    </div>
  );
}

export function ImageControls({
  image,
  layout,
  onChange,
}: {
  image: ImageInfo;
  layout: ImageLayout;
  onChange: (layout: ImageLayout) => void;
}) {
  const set = (patch: Partial<ImageLayout>) => onChange({ ...layout, ...patch });
  const recentre = { offsetX: 0, offsetY: 0 };

  return (
    <>
      <div>
        <ChoiceGroup<ImageScale>
          label="Storlek"
          name="scale"
          value={layout.scale}
          onChange={(scale) => set({ scale, ...recentre })}
          options={[
            { value: "fit", label: "Anpassa", description: "Hela bilden syns" },
            { value: "fill", label: "Fyll sidan", description: "Kanterna beskärs" },
            { value: "actual", label: "Original", description: `Utskriven i ${Math.round(image.dpi)} dpi` },
            { value: "custom", label: "Egen", description: `${layout.customPercent} % av anpassad` },
          ]}
        />
        {layout.scale === "custom" && (
          <label className="mt-3 flex items-center gap-3">
            <span className="sr-only">Storlek i procent</span>
            <input
              type="range"
              min={CUSTOM_PERCENT.min}
              max={CUSTOM_PERCENT.max}
              step={5}
              value={layout.customPercent}
              onChange={(e) => set({ customPercent: Number(e.target.value) })}
              className="flex-1 accent-rosa-background"
            />
            <span className="w-12 text-right font-mono text-sm">{layout.customPercent} %</span>
          </label>
        )}
      </div>
      <ChoiceGroup
        label="Orientering"
        name="orientation"
        segmented
        value={layout.orientation}
        onChange={(orientation) => set({ orientation })}
        options={[
          { value: "auto", label: "Auto" },
          { value: "portrait", label: "Stående" },
          { value: "landscape", label: "Liggande" },
        ]}
      />
      <ChoiceGroup
        label="Marginal"
        name="margin"
        value={layout.margin}
        onChange={(margin) => set({ margin })}
        options={[
          { value: "normal", label: "Normal", description: "10 mm" },
          { value: "narrow", label: "Smal", description: "5 mm" },
        ]}
      />
      <ChoiceGroup
        label="Bilder per ark"
        name="perSheet"
        segmented
        value={String(layout.perSheet)}
        onChange={(n) => set({ perSheet: Number(n) as ImageLayout["perSheet"], ...recentre })}
        options={["1", "2", "4"].map((n) => ({ value: n, label: n }))}
      />
    </>
  );
}
