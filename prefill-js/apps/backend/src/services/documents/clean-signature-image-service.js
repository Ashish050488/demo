// Turns a photo or scan of a signature into clean ink: the paper (white, grey, shadowed) becomes transparent, the
// ink becomes black with soft edges kept, and empty margins are cropped - so it sits on the form's line like ink.
import { createCanvas, loadImage } from "canvas";

const MAXIMUM_WIDTH_PIXELS = 1200;
const CROP_PADDING_PIXELS = 6;
// A pixel counts as ink when it is this much darker than the paper around it.
const INK_CONTRAST = 0.18;

/** The paper's brightness: a high percentile of all pixels (paper is most of a signature photo). */
function estimatePaperBrightness(luminances) {
  const sorted = Float32Array.from(luminances).sort();
  return sorted[Math.floor(sorted.length * 0.85)];
}

/** PNG bytes of the cleaned signature. Throws when no ink is found (an empty or almost blank image). */
export async function cleanSignatureImage(imageBytes) {
  const image = await loadImage(imageBytes);
  const scale = Math.min(1, MAXIMUM_WIDTH_PIXELS / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const sourceCanvas = createCanvas(width, height);
  const sourceContext = sourceCanvas.getContext("2d");
  sourceContext.fillStyle = "#fff"; // a transparent PNG's empty parts count as paper
  sourceContext.fillRect(0, 0, width, height);
  sourceContext.drawImage(image, 0, 0, width, height);
  const pixels = sourceContext.getImageData(0, 0, width, height);

  const luminances = new Float32Array(width * height);
  for (let index = 0; index < luminances.length; index += 1) {
    const offset = index * 4;
    luminances[index] = (0.299 * pixels.data[offset] + 0.587 * pixels.data[offset + 1] + 0.114 * pixels.data[offset + 2]) / 255;
  }
  const paper = estimatePaperBrightness(luminances);
  const inkLimit = paper - INK_CONTRAST;
  const inkXs = [];
  const inkYs = [];
  for (let index = 0; index < luminances.length; index += 1) {
    // Fully opaque at clear ink, fading out towards the paper's brightness (keeps pen strokes smooth).
    const opacity = Math.max(0, Math.min(1, (inkLimit - luminances[index]) / Math.max(0.05, inkLimit * 0.35) + 0.15));
    const isInk = luminances[index] < inkLimit;
    const offset = index * 4;
    pixels.data[offset] = 0; pixels.data[offset + 1] = 0; pixels.data[offset + 2] = 0;
    pixels.data[offset + 3] = isInk ? Math.round(opacity * 255) : 0;
    if (isInk) { inkXs.push(index % width); inkYs.push(Math.floor(index / width)); }
  }
  // Crop to where nearly all the ink is: a dust speck or shadow far from the signature is left out.
  const bounds = (values) => { const sorted = values.sort((first, second) => first - second); return [sorted[Math.floor(sorted.length * 0.003)], sorted[Math.ceil(sorted.length * 0.997) - 1]]; };
  let [left, right] = inkXs.length ? bounds(inkXs) : [0, -1];
  let [top, bottom] = inkYs.length ? bounds(inkYs) : [0, -1];
  if (right < 0 || (right - left) * (bottom - top) < 50) throw new Error("No signature found in this image - use a clear photo or scan of the signature on white paper");
  sourceContext.putImageData(pixels, 0, 0);

  left = Math.max(0, left - CROP_PADDING_PIXELS); top = Math.max(0, top - CROP_PADDING_PIXELS);
  right = Math.min(width - 1, right + CROP_PADDING_PIXELS); bottom = Math.min(height - 1, bottom + CROP_PADDING_PIXELS);
  const croppedCanvas = createCanvas(right - left + 1, bottom - top + 1);
  croppedCanvas.getContext("2d").drawImage(sourceCanvas, left, top, right - left + 1, bottom - top + 1, 0, 0, right - left + 1, bottom - top + 1);
  return croppedCanvas.toBuffer("image/png");
}
