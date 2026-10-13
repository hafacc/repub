// the toolbar icon is drawn rather than badged, so a conversion shows as a ring
// closing around the icon instead of a number beside it
const SIZE = 32;
const STROKE = 3;
const TRACK = "rgba(0, 0, 0, 0.15)";
const FILL = "#000000";
const FAILED = "#d62626";

const sizes = [16, 32, 48, 128];
const paths = Object.fromEntries(
  sizes.map((size) => [size, `images/repub_${size.toFixed()}.png`]),
);

let loading: Promise<ImageBitmap> | null = null;
let plain: ImageData | null = null;

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

/** the icon, with a ring around it when there's a conversion to show */
async function paint(
  ring: { portion: number; color: string } | null,
): Promise<ImageData> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("couldn't draw the toolbar icon");
  }

  // the icon gives up room for the ring, so what it draws stays inside it
  const inset = ring ? STROKE * 2 : 0;
  ctx.drawImage(
    await glyph(),
    inset,
    inset,
    SIZE - 2 * inset,
    SIZE - 2 * inset,
  );

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

/** ring the icon of `tabId` to show how much of its conversion is done */
export async function showProgress(
  tabId: number,
  portion: number,
): Promise<void> {
  const imageData = await paint({ portion, color: FILL });
  await chrome.action.setIcon({ tabId, imageData });
}

/** ring the icon of `tabId` in red, for a conversion that failed */
export async function showFailed(tabId: number): Promise<void> {
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
  try {
    plain ??= await paint(null);
    await chrome.action.setIcon({ tabId, imageData: plain });
  } catch (ex) {
    console.warn(ex);
    await chrome.action.setIcon({ tabId, path: paths });
  }
}
