// Generates the PWA icons (flat barbell mark, orange accent on near-black)
// without external image dependencies. Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x0b, 0x0b, 0x0c];
const ACCENT = [0xf2, 0x5c, 0x05];
const TEXT = [0xf2, 0xf2, 0xf0];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    pixels.copy(
      raw,
      y * (size * 3 + 1) + 1,
      y * size * 3,
      (y + 1) * size * 3,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { pad = 0 } = {}) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, [r, g, b]) => {
    const i = (y * size + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) set(x, y, BG);

  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++)
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, color);
  };

  // barbell mark: thin bar + two plates per side; accent bar, gray plates
  const s = size - pad * 2;
  const cx = size / 2;
  const cy = size / 2;
  const barH = s * 0.055;
  const barW = s * 0.72;
  rect(cx - barW / 2, cy - barH / 2, cx + barW / 2, cy + barH / 2, ACCENT);
  const plateH = s * 0.34;
  const plateW = s * 0.07;
  const innerH = s * 0.24;
  for (const side of [-1, 1]) {
    const xOuter = cx + side * barW * 0.5 - (side > 0 ? plateW : 0);
    rect(xOuter, cy - plateH / 2, xOuter + plateW, cy + plateH / 2, TEXT);
    const xInner =
      cx + side * (barW * 0.5 - plateW * 1.8) - (side > 0 ? plateW : 0);
    rect(xInner, cy - innerH / 2, xInner + plateW, cy + innerH / 2, TEXT);
  }
  return encodePng(size, px);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", drawIcon(192));
writeFileSync("public/icons/icon-512.png", drawIcon(512));
// maskable: same mark inside the 80% safe zone
writeFileSync(
  "public/icons/icon-maskable-512.png",
  drawIcon(512, { pad: 64 }),
);
console.log("icons written to public/icons/");
