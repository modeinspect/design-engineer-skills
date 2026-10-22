// Dependency-free PNG comparison, used as a library by capture scripts and as a
// command line tool.
//
// Command line:
//   node pixel-diff.mjs <before-dir> <after-dir> --out <diff-dir> [--threshold 8] [--repeat <dir>]
// Prints one JSON object per line (one per file name) and writes a diff PNG
// for every pair that changed: changed pixels red, noise yellow, the rest faded.
// --repeat names a second capture of the before side. Pixels that differ
// between the two before captures are noise: excluded from the count and
// reported as noisePixels. Exits 1 on any read or decode error or missing pair.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file}: not a PNG`);
  let offset = 8;
  let width, height, bitDepth, colorType, interlace;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error(
      `${file}: unsupported PNG (bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}). ` +
        "Only 8-bit, non-interlaced grayscale, RGB and RGBA are supported; re-capture with Playwright or convert the file.",
    );
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`${file}: bad PNG filter ${filter} on row ${y}`);
      out[x] = value & 0xff;
    }
    prev = out;
  }
  // Normalise to RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const g = pixels[j];
    if (channels === 1) rgba.set([g, g, g, 255], i * 4);
    else if (channels === 2) rgba.set([g, g, g, pixels[j + 1]], i * 4);
    else if (channels === 3) rgba.set([pixels[j], pixels[j + 1], pixels[j + 2], 255], i * 4);
    else rgba.set(pixels.subarray(j, j + 4), i * 4);
  }
  return { width, height, rgba };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CELL = 16;

// Max channel difference between the same pixel in two images.
function pixelDelta(imgA, imgB, x, y) {
  const a = (y * imgA.width + x) * 4;
  const b = (y * imgB.width + x) * 4;
  let delta = 0;
  for (let k = 0; k < 4; k++) delta = Math.max(delta, Math.abs(imgA.rgba[a + k] - imgB.rgba[b + k]));
  return delta;
}

// Merge touching 16px cells that hold a changed pixel into rectangles, largest first.
function regionsOf(grid, cw, ch) {
  const seen = new Uint8Array(cw * ch);
  const regions = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(), cx = c % cw, cy = (c / cw) | 0;
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * cw + nx;
        if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    regions.push({ x: x0 * CELL, y: y0 * CELL, w: (x1 - x0 + 1) * CELL, h: (y1 - y0 + 1) * CELL });
  }
  return regions.sort((r, q) => q.w * q.h - r.w * r.h);
}

// Compares two decoded images. A pixel changed when any channel differs by
// more than `threshold` (0 to 255), or when it exists in only one image.
// `repeat` is an optional second capture of `before`: pixels that differ
// between the two are noise, counted apart and painted yellow.
// Returns { width, height, diff (RGBA), changed, noise, bbox, regions }.
export function compareImages(before, after, { threshold = 8, repeat = null } = {}) {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const diff = Buffer.alloc(width * height * 4);
  const cw = Math.ceil(width / CELL);
  const grid = new Uint8Array(cw * Math.ceil(height / CELL));
  let changed = 0;
  let noise = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const inBefore = x < before.width && y < before.height;
      const inAfter = x < after.width && y < after.height;
      let isChanged = inBefore !== inAfter;
      let gray = 255;
      if (inBefore && inAfter) {
        isChanged = pixelDelta(before, after, x, y) > threshold;
        const a = (y * after.width + x) * 4;
        const lum = 0.299 * after.rgba[a] + 0.587 * after.rgba[a + 1] + 0.114 * after.rgba[a + 2];
        gray = Math.round(255 - (255 - lum) * 0.25); // faded context
      }
      if (isChanged && repeat && inBefore && pixelDelta(before, repeat, x, y) > threshold) {
        noise++;
        diff.set([250, 200, 0, 255], o);
        continue;
      }
      if (isChanged) {
        changed++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        grid[((y / CELL) | 0) * cw + ((x / CELL) | 0)] = 1;
        diff.set([230, 0, 60, 255], o);
      } else {
        diff.set([gray, gray, gray, 255], o);
      }
    }
  }
  return {
    width,
    height,
    diff,
    changed,
    noise,
    bbox: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    regions: changed ? regionsOf(grid, cw, Math.ceil(height / CELL)) : [],
  };
}

function main(args) {
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    if (i === -1) return fallback;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };
  const outDir = flag("--out");
  const threshold = Number(flag("--threshold", "8"));
  const repeatDir = flag("--repeat");
  const [beforeDir, afterDir] = args;
  if (!beforeDir || !afterDir || !outDir || Number.isNaN(threshold)) {
    console.error("Usage: node pixel-diff.mjs <before-dir> <after-dir> --out <diff-dir> [--threshold 8] [--repeat <dir>]");
    process.exit(2);
  }
  const pngs = (dir) => new Set(fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")));
  const beforeFiles = pngs(beforeDir);
  const afterFiles = pngs(afterDir);
  const names = [...new Set([...beforeFiles, ...afterFiles])].sort();
  if (names.length === 0) {
    console.error(`No PNG files in ${beforeDir} or ${afterDir}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  let failed = false;
  for (const name of names) {
    if (!beforeFiles.has(name) || !afterFiles.has(name)) {
      console.log(JSON.stringify({ name, status: beforeFiles.has(name) ? "missing-after" : "missing-before" }));
      failed = true;
      continue;
    }
    try {
      const before = decodePng(path.join(beforeDir, name));
      const after = decodePng(path.join(afterDir, name));
      const repeat = repeatDir ? decodePng(path.join(repeatDir, name)) : null;
      if (repeat && (repeat.width !== before.width || repeat.height !== before.height)) {
        console.log(JSON.stringify({ name, status: "unstable", reason: `before is ${before.width}x${before.height}, repeat is ${repeat.width}x${repeat.height}` }));
        failed = true;
        continue;
      }
      const result = compareImages(before, after, { threshold, repeat });
      const total = result.width * result.height;
      const sizeChanged = before.width !== after.width || before.height !== after.height;
      const status = result.changed === 0 ? "unchanged" : "changed";
      if (status === "changed") fs.writeFileSync(path.join(outDir, name), encodePng(result.width, result.height, result.diff));
      console.log(
        JSON.stringify({
          name,
          status,
          changedPixels: result.changed,
          changedPercent: Number(((result.changed / total) * 100).toFixed(3)),
          noisePixels: repeat ? result.noise : null,
          bbox: result.bbox,
          before: `${before.width}x${before.height}`,
          after: `${after.width}x${after.height}`,
          sizeChanged,
          diff: status === "changed" ? path.join(outDir, name) : null,
        }),
      );
    } catch (error) {
      console.log(JSON.stringify({ name, status: "error", error: error.message }));
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

// Run as a command only when executed directly, not when imported. Node runs
// the real path of a symlinked script, so compare real paths.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main(process.argv.slice(2));
