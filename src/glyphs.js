import * as THREE from "three";
/** One cell of the glyph sheet. 64 columns stay inside a 4096 texture. */
const CELL = 64;
const COLUMNS = 64;

/**
 * Draw every character once into a shared sheet. The mesh samples a
 * rectangle per instance instead of keeping a texture per sign.
 * Glyphs are white; the mesh tints them by HSK level.
 * @param {{ c: string }[]} chars
 */
export async function buildGlyphAtlas(chars) {
  await document.fonts.load(`${CELL}px "Noto Serif SC"`);
  await document.fonts.ready;

  const columns = Math.min(COLUMNS, chars.length);
  const rows = Math.ceil(chars.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * CELL;
  canvas.height = rows * CELL;

  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 ${Math.round(CELL * 0.72)}px "Noto Serif SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const rects = new Float32Array(chars.length * 4);
  for (let i = 0; i < chars.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    ctx.fillText(chars[i].c, col * CELL + CELL / 2, row * CELL + CELL / 2);

    // flipY is off, so v = 0 is the top of the canvas. Row 0 is the first cell.
    rects[i * 4] = col / columns;
    rects[i * 4 + 1] = row / rows;
    rects[i * 4 + 2] = 1 / columns;
    rects[i * 4 + 3] = 1 / rows;
  }

  const texture = new THREE.CanvasTexture(canvas);
  // Default flipY would mirror the sheet again. The shader flips the quad's V once.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return { texture, rects };
}
