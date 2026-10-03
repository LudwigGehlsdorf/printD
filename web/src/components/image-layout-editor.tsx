"use client";

import { useRef, useState } from "react";
import { ChoiceGroup } from "@/components/ui";
import {
  CUSTOM_PERCENT_RANGE,
  layoutImage,
  type ImageInfo,
  type ImageLayout,
  type ImageScale,
} from "@/lib/image-layout";

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/**
 * A4 sheet with the image placed exactly as it will be printed (same layout function as the
 * server). The image can be dragged to choose what is cropped or where it sits.
 */
export function ImagePreview({
  src,
  image,
  layout,
  onChange,
  disabled = false,
}: {
  src: string;
  image: ImageInfo;
  layout: ImageLayout;
  onChange: (layout: ImageLayout) => void;
  disabled?: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const page = layoutImage(image, layout);
  const cell = page.cells[0];
  const slackX = cell.w - cell.image.w;
  const slackY = cell.h - cell.image.h;
  const movable = !disabled && (Math.abs(slackX) > 0.5 || Math.abs(slackY) > 0.5);
  const moved = layout.offsetX !== 0 || layout.offsetY !== 0;

  function startDrag(e: React.PointerEvent) {
    if (!movable || !sheet.current) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const pointsPerPixel = page.width / sheet.current.getBoundingClientRect().width;
    const start = { x: e.clientX, y: e.clientY, offsetX: layout.offsetX, offsetY: layout.offsetY };

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) * pointsPerPixel;
      const dy = (ev.clientY - start.y) * pointsPerPixel;
      // The offset spans the free space (or overflow): moving by slack/2 changes it by 1.
      const clamp = (n: number) => Math.min(1, Math.max(-1, n));
      onChange({
        ...layout,
        offsetX: Math.abs(slackX) > 0.5 ? clamp(start.offsetX + (2 * dx) / slackX) : layout.offsetX,
        offsetY: Math.abs(slackY) > 0.5 ? clamp(start.offsetY + (2 * dy) / slackY) : layout.offsetY,
      });
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }

  return (
    <div>
      <div
        ref={sheet}
        className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xs border bg-white shadow-sm transition-[aspect-ratio] duration-200"
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
        aria-label="Förhandsvisning av utskriften"
      >
        {!loaded && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">Laddar bild…</p>
        )}
        {/* The area the printer can reach. */}
        <div
          className="pointer-events-none absolute border border-dashed border-zinc-300"
          style={{
            left: pct(page.printable.x, page.width),
            top: pct(page.printable.y, page.height),
            width: pct(page.printable.w, page.width),
            height: pct(page.printable.h, page.height),
          }}
        />
        {page.cells.map((c, i) => (
          <div
            key={i}
            onPointerDown={startDrag}
            className={`absolute touch-none overflow-hidden ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
            style={{
              left: pct(c.x, page.width),
              top: pct(c.y, page.height),
              width: pct(c.w, page.width),
              height: pct(c.h, page.height),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- private, already-sized upload */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={() => setLoaded(true)}
              className={`absolute max-w-none select-none transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              style={{
                left: pct(c.image.x - c.x, c.w),
                top: pct(c.image.y - c.y, c.h),
                width: pct(c.image.w, c.w),
                height: pct(c.image.h, c.h),
              }}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {movable ? "Dra i bilden för att flytta den." : "Den streckade linjen visar skrivarens marginal."}
        {moved && !disabled && (
          <>
            {" "}
            <button
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onChange({ ...layout, offsetX: 0, offsetY: 0 })}
            >
              Centrera
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/** Scaling, orientation, margins and images per sheet. */
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

  return (
    <>
      <div>
        <ChoiceGroup<ImageScale>
          label="Storlek"
          name="scale"
          value={layout.scale}
          // A new size mode starts centred.
          onChange={(scale) => set({ scale, offsetX: 0, offsetY: 0 })}
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
              min={CUSTOM_PERCENT_RANGE.min}
              max={CUSTOM_PERCENT_RANGE.max}
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
        columns={3}
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
        columns={3}
        value={String(layout.perSheet) as "1" | "2" | "4"}
        onChange={(v) => set({ perSheet: Number(v) as ImageLayout["perSheet"], offsetX: 0, offsetY: 0 })}
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "4", label: "4" },
        ]}
      />
    </>
  );
}
