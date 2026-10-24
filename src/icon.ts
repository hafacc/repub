import { easeCubicOut } from "d3-ease";
import { interval, type Timer } from "d3-timer";
import { reach, type Spot } from "./progress";

// the toolbar icon is drawn rather than badged, so a conversion shows as a ring
// closing around the icon instead of a number beside it
const SIZE = 32;
const STROKE = 3;
const TRACK = "rgba(0, 0, 0, 0.15)";
// the ring runs at part strength while a conversion is going and turns full
// black the moment it's done, so a closed ring reads differently from one that
// is only nearly closed
const WORKING = "rgba(0, 0, 0, 0.42)";
const FILL = "#000000";
const FAILED = "#d62626";

// how long the ring takes to reach a spot it was just told about
const SWEEP = 350;
// how long the drift past that spot takes to cover most of the step
const DRIFT = 6000;
// how long between frames; the ring is 32 pixels across, so this is plenty
const FRAME = 40;
// the smallest move worth drawing the icon again for
const NUDGE = 1 / 200;

const sizes = [16, 32, 48, 128];
const paths = Object.fromEntries(
  sizes.map((size) => [size, `images/repub_${size.toFixed()}.png`]),
);

let loading: Promise<ImageBitmap> | null = null;
let plain: ImageData | null = null;
let canvas: OffscreenCanvas | null = null;

function glyph(): Promise<ImageBitmap> {
  loading ??= fetch(chrome.runtime.getURL("images/repub_128.png"))
    .then((resp) => resp.blob())
    .then((blob) => createImageBitmap(blob))
    .catch((ex: unknown) => {
      loading = null;
      throw ex;
    });
  return loading;
}

/** where the filled part of the ring starts and ends, clockwise from the top */
export function arc(portion: number): [number, number] {
  const start = -Math.PI / 2;
  const span = 2 * Math.PI * Math.min(Math.max(portion, 0), 1);
  return [start, start + span];
}

/**
 * where the ring sits `elapsed` milliseconds into a move
 *
 * It eases from `start` to the spot it was told about, and then drifts on
 * toward the end of the step, slowing as it goes, so that a step which reports
 * nothing for a while still looks like it's working.
 */
export function ringAt(
  start: number,
  { progress, upto }: Spot,
  elapsed: number,
): number {
  const swept =
    start + (progress - start) * easeCubicOut(Math.min(elapsed / SWEEP, 1));
  const drift = 1 - Math.exp(-Math.max(elapsed - SWEEP, 0) / DRIFT);
  return swept + (reach({ progress, upto }) - progress) * drift;
}

/** the icon, with a ring around it when there's a conversion to show */
async function paint(
  ring: { portion: number; color: string } | null,
): Promise<ImageData> {
  const bitmap = await glyph();
  canvas ??= new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("couldn't draw the toolbar icon");
  }
  ctx.clearRect(0, 0, SIZE, SIZE);

  // the ring is drawn on the icon's own white circle, so the icon keeps the
  // whole square and never changes size for a conversion
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);

  if (ring) {
    const center = SIZE / 2;
    const radius = center - STROKE / 2;
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = TRACK;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.stroke();

    const [start, end] = arc(ring.portion);
    if (end > start) {
      ctx.strokeStyle = ring.color;
      ctx.beginPath();
      ctx.arc(center, center, radius, start, end);
      ctx.stroke();
    }
  }

  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** the moving ring on one tab's icon */
class Ring {
  readonly #tabId: number;
  #spot: Spot = { progress: 0, upto: 0 };
  #start = 0;
  // the ring as drawn, counted in nudges so that it compares exactly
  #drawn = -1;
  #clock: Timer | null = null;
  #drawing = false;

  constructor(tabId: number) {
    this.#tabId = tabId;
  }

  /** ease to `spot`, then drift on toward the end of its step */
  aim(spot: Spot): void {
    // a conversion starting over, or a step that has got less far than the
    // drift already showed, snaps instead of winding backwards
    const shown = Math.max(this.#drawn, 0) * NUDGE;
    this.#start = spot.progress < shown ? spot.progress : shown;
    this.#spot = spot;
    this.#clock?.stop();
    this.#clock = interval((elapsed) => {
      this.#frame(elapsed);
    }, FRAME);
    this.#frame(0);
  }

  /** stop moving and leave the icon as it is */
  stop(): void {
    this.#clock?.stop();
    this.#clock = null;
  }

  #frame(elapsed: number): void {
    const at = ringAt(this.#start, this.#spot, elapsed);
    if (reach(this.#spot) - at < NUDGE) {
      // there's nowhere left to drift, so wait for the next thing reported
      this.stop();
    }
    const nudges = Math.round(at / NUDGE);
    if (this.#drawing || nudges === this.#drawn) {
      return;
    }
    this.#drawn = nudges;
    this.#drawing = true;
    const color = this.#spot.progress < 1 ? WORKING : FILL;
    paint({ portion: nudges * NUDGE, color })
      .then((imageData) =>
        chrome.action.setIcon({ tabId: this.#tabId, imageData }),
      )
      .catch((ex: unknown) => {
        console.warn(ex);
      })
      .finally(() => {
        this.#drawing = false;
      });
  }
}

const rings = new Map<number, Ring>();

function ringOf(tabId: number): Ring {
  const ring = rings.get(tabId);
  if (ring) {
    return ring;
  } else {
    const made = new Ring(tabId);
    rings.set(tabId, made);
    return made;
  }
}

function forget(tabId: number): void {
  rings.get(tabId)?.stop();
  rings.delete(tabId);
}

/** ring the icon of `tabId` to show how much of its conversion is done */
export function showProgress(tabId: number, spot: Spot): void {
  ringOf(tabId).aim(spot);
}

/** ring the icon of `tabId` in red, for a conversion that failed */
export async function showFailed(tabId: number): Promise<void> {
  forget(tabId);
  const imageData = await paint({ portion: 1, color: FAILED });
  await chrome.action.setIcon({ tabId, imageData });
}

/**
 * put the plain icon back on `tabId`
 *
 * This runs on every navigation, so the drawn icon is kept rather than made
 * again; the files are only read if it can't be drawn at all.
 */
export async function clearProgress(tabId: number): Promise<void> {
  forget(tabId);
  try {
    plain ??= await paint(null);
    await chrome.action.setIcon({ tabId, imageData: plain });
  } catch (ex) {
    console.warn(ex);
    await chrome.action.setIcon({ tabId, path: paths });
  }
}
