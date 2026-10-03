// Where an image goes on the paper. Used both by the browser preview and when building the
// PDF, so the preview matches the print exactly. Units are PDF points (1/72 inch), measured
// from the page's top-left corner.

export type ImageScale = "fit" | "fill" | "actual" | "custom";

export type ImageLayout = {
  scale: ImageScale;
  /** Size for "custom", in percent of "fit". */
  customPercent: number;
  orientation: "auto" | "portrait" | "landscape";
  margin: "normal" | "narrow";
  /** Copies of the image on each sheet. */
  perSheet: 1 | 2 | 4;
  /** Where the image sits in its cell: -1 at the left/top edge, 0 centred, 1 at the right/bottom. */
  offsetX: number;
  offsetY: number;
};

export type ImageInfo = { width: number; height: number; dpi: number };

type Rect = { x: number; y: number; w: number; h: number };

export const DEFAULT_LAYOUT: ImageLayout = {
  scale: "fit",
  customPercent: 100,
  orientation: "auto",
  margin: "normal",
  perSheet: 1,
  offsetX: 0,
  offsetY: 0,
};

export const CUSTOM_PERCENT = { min: 10, max: 200 };

const A4 = { short: 595.28, long: 841.89 };
const MM = 72 / 25.4;
const MARGINS = { normal: 10 * MM, narrow: 5 * MM };
const GAP = 5 * MM;

export function layoutImage(image: ImageInfo, layout: ImageLayout) {
  const portrait = pageLayout(image, layout, false);
  const landscape = pageLayout(image, layout, true);
  if (layout.orientation === "portrait") return portrait;
  if (layout.orientation === "landscape") return landscape;
  // Auto picks the orientation where the whole image can be shown largest.
  return fitScale(image, landscape.cells[0]) > fitScale(image, portrait.cells[0]) ? landscape : portrait;
}

function pageLayout(image: ImageInfo, layout: ImageLayout, landscape: boolean) {
  const width = landscape ? A4.long : A4.short;
  const height = landscape ? A4.short : A4.long;
  const m = MARGINS[layout.margin];
  const printable = { x: m, y: m, w: width - 2 * m, h: height - 2 * m };
  const cells = splitCells(printable, layout.perSheet).map((cell) => ({ ...cell, image: placeImage(image, layout, cell) }));
  return { width, height, printable, cells };
}

function splitCells(box: Rect, perSheet: ImageLayout["perSheet"]): Rect[] {
  if (perSheet === 1) return [box];
  const halfW = (box.w - GAP) / 2;
  const halfH = (box.h - GAP) / 2;
  const right = box.x + halfW + GAP;
  const lower = box.y + halfH + GAP;
  if (perSheet === 2) {
    // Split along the long side.
    return box.w > box.h
      ? [{ ...box, w: halfW }, { ...box, x: right, w: halfW }]
      : [{ ...box, h: halfH }, { ...box, y: lower, h: halfH }];
  }
  return [
    { x: box.x, y: box.y, w: halfW, h: halfH },
    { x: right, y: box.y, w: halfW, h: halfH },
    { x: box.x, y: lower, w: halfW, h: halfH },
    { x: right, y: lower, w: halfW, h: halfH },
  ];
}

const fitScale = (image: ImageInfo, cell: Rect) => Math.min(cell.w / image.width, cell.h / image.height);

function placeImage(image: ImageInfo, layout: ImageLayout, cell: Rect): Rect {
  const scale = {
    fit: fitScale(image, cell),
    fill: Math.max(cell.w / image.width, cell.h / image.height),
    actual: 72 / image.dpi,
    custom: (fitScale(image, cell) * layout.customPercent) / 100,
  }[layout.scale];
  const w = image.width * scale;
  const h = image.height * scale;
  // The offset moves the image across the space left in the cell, or across the overflow
  // when the image is larger than the cell.
  return {
    x: cell.x + ((cell.w - w) * (1 + layout.offsetX)) / 2,
    y: cell.y + ((cell.h - h) * (1 + layout.offsetY)) / 2,
    w,
    h,
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n || 0));

/** Validates a layout sent by the browser. */
export function parseLayout(value: Partial<Record<keyof ImageLayout, unknown>> | undefined): ImageLayout {
  const pick = <T>(x: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(x as T) ? (x as T) : fallback);
  return {
    scale: pick(value?.scale, ["fit", "fill", "actual", "custom"] as const, "fit"),
    orientation: pick(value?.orientation, ["auto", "portrait", "landscape"] as const, "auto"),
    margin: pick(value?.margin, ["normal", "narrow"] as const, "normal"),
    perSheet: pick(value?.perSheet, [1, 2, 4] as const, 1),
    customPercent: clamp(Number(value?.customPercent ?? 100), CUSTOM_PERCENT.min, CUSTOM_PERCENT.max),
    offsetX: clamp(Number(value?.offsetX), -1, 1),
    offsetY: clamp(Number(value?.offsetY), -1, 1),
  };
}
