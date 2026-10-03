/**
 * Where an image goes on the paper. Shared by the browser preview and the server's PDF
 * builder, so the preview is exactly what gets printed.
 *
 * All measurements are in PDF points (1/72 inch) with the origin in the page's top-left corner.
 */

export type ImageScale = "fit" | "fill" | "actual" | "custom";

export type ImageLayout = {
  /** fit: whole image visible. fill: covers the cell, edges cropped. actual: printed at its DPI. */
  scale: ImageScale;
  /** For "custom": size relative to "fit", in percent. */
  customPercent: number;
  orientation: "auto" | "portrait" | "landscape";
  margin: "normal" | "narrow";
  /** How many copies of the image go on each sheet. */
  perSheet: 1 | 2 | 4;
  /** Position within the cell, -1 (left/top edge) … 1 (right/bottom edge). 0 is centred. */
  offsetX: number;
  offsetY: number;
};

export type ImageInfo = { width: number; height: number; dpi: number };

export type Rect = { x: number; y: number; w: number; h: number };
export type Cell = Rect & { image: Rect };
export type PageLayout = { width: number; height: number; printable: Rect; cells: Cell[] };

export const DEFAULT_LAYOUT: ImageLayout = {
  scale: "fit",
  customPercent: 100,
  orientation: "auto",
  margin: "normal",
  perSheet: 1,
  offsetX: 0,
  offsetY: 0,
};

const A4 = { short: 595.28, long: 841.89 };
const MM = 72 / 25.4;
/** 10 mm, or the printer's minimum of about 5 mm. */
const MARGINS = { normal: 10 * MM, narrow: 5 * MM };
const GAP = 5 * MM;
export const CUSTOM_PERCENT_RANGE = { min: 10, max: 200 };

export function layoutImage(image: ImageInfo, layout: ImageLayout): PageLayout {
  const portrait = pageFor(image, layout, false);
  if (layout.orientation === "portrait") return portrait;
  const landscape = pageFor(image, layout, true);
  if (layout.orientation === "landscape") return landscape;
  // Auto: the orientation where the image can be shown largest without cropping.
  return fitArea(image, landscape) > fitArea(image, portrait) ? landscape : portrait;
}

function pageFor(image: ImageInfo, layout: ImageLayout, landscape: boolean): PageLayout {
  const width = landscape ? A4.long : A4.short;
  const height = landscape ? A4.short : A4.long;
  const m = MARGINS[layout.margin];
  const printable = { x: m, y: m, w: width - 2 * m, h: height - 2 * m };
  const cells = splitCells(printable, layout.perSheet).map((cell) => ({
    ...cell,
    image: placeImage(image, layout, cell),
  }));
  return { width, height, printable, cells };
}

/** 2 per sheet splits along the long side; 4 is a 2×2 grid. */
function splitCells(box: Rect, perSheet: ImageLayout["perSheet"]): Rect[] {
  if (perSheet === 1) return [box];
  if (perSheet === 2) {
    if (box.w > box.h) {
      const w = (box.w - GAP) / 2;
      return [
        { ...box, w },
        { ...box, x: box.x + w + GAP, w },
      ];
    }
    const h = (box.h - GAP) / 2;
    return [
      { ...box, h },
      { ...box, y: box.y + h + GAP, h },
    ];
  }
  const w = (box.w - GAP) / 2;
  const h = (box.h - GAP) / 2;
  return [
    { x: box.x, y: box.y, w, h },
    { x: box.x + w + GAP, y: box.y, w, h },
    { x: box.x, y: box.y + h + GAP, w, h },
    { x: box.x + w + GAP, y: box.y + h + GAP, w, h },
  ];
}

function placeImage(image: ImageInfo, layout: ImageLayout, cell: Rect): Rect {
  const fit = Math.min(cell.w / image.width, cell.h / image.height);
  let scale: number;
  switch (layout.scale) {
    case "fit":
      scale = fit;
      break;
    case "fill":
      scale = Math.max(cell.w / image.width, cell.h / image.height);
      break;
    case "actual":
      scale = 72 / (image.dpi || 72);
      break;
    case "custom":
      scale = (fit * clamp(layout.customPercent, CUSTOM_PERCENT_RANGE.min, CUSTOM_PERCENT_RANGE.max)) / 100;
      break;
  }
  const w = image.width * scale;
  const h = image.height * scale;
  // The offset moves the image across the free space (or the overflow, when it is cropped).
  const x = cell.x + (cell.w - w) * (0.5 + clamp(layout.offsetX, -1, 1) / 2);
  const y = cell.y + (cell.h - h) * (0.5 + clamp(layout.offsetY, -1, 1) / 2);
  return { x, y, w, h };
}

function fitArea(image: ImageInfo, page: PageLayout) {
  const cell = page.cells[0];
  const fit = Math.min(cell.w / image.width, cell.h / image.height);
  return image.width * fit * image.height * fit;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));
}

/** Validates a layout coming from the browser. Returns null if it is malformed. */
export function parseLayout(value: unknown): ImageLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const pick = <T extends string | number>(x: unknown, allowed: readonly T[]) =>
    allowed.includes(x as T) ? (x as T) : null;
  const scale = pick(v.scale, ["fit", "fill", "actual", "custom"] as const);
  const orientation = pick(v.orientation, ["auto", "portrait", "landscape"] as const);
  const margin = pick(v.margin, ["normal", "narrow"] as const);
  const perSheet = pick(v.perSheet, [1, 2, 4] as const);
  if (!scale || !orientation || !margin || !perSheet) return null;
  return {
    scale,
    orientation,
    margin,
    perSheet,
    customPercent: clamp(Number(v.customPercent), CUSTOM_PERCENT_RANGE.min, CUSTOM_PERCENT_RANGE.max),
    offsetX: clamp(Number(v.offsetX), -1, 1),
    offsetY: clamp(Number(v.offsetY), -1, 1),
  };
}
