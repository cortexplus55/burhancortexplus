// Mobil uygulama simgeleri ve açılış ekranı (26 Kasım 2026). Kaynak: sitenin kendi 3B işareti
// (`public/logo-mark-trim.png`), zemin uygulamanın açılış rengi #05070E. Çıktılar Android ve iOS projelerine yazılır;
// logo değişirse bu betik yeniden çalıştırılır:  node scripts/mobile-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARK = path.join(root, "public/logo-mark-trim.png");
const BACKGROUND = { r: 5, g: 7, b: 14, alpha: 1 };

/** Kare ya da dikdörtgen zemin + ortada işaret. `markShare`: işaretin genişliği / tuvalin kısa kenarı. */
async function compose(width, height, markShare, { transparent = false } = {}) {
  const markWidth = Math.round(Math.min(width, height) * markShare);
  const mark = await sharp(MARK).resize({ width: markWidth, kernel: "lanczos3" }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  return sharp({
    create: { width, height, channels: 4, background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : BACKGROUND },
  })
    .composite([{ input: mark, left: Math.round((width - meta.width) / 2), top: Math.round((height - meta.height) / 2) }])
    .png()
    .toBuffer();
}

async function write(file, buffer, { flatten = false } = {}) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  const out = flatten ? await sharp(buffer).flatten({ background: BACKGROUND }).png().toBuffer() : buffer;
  writeFileSync(target, out);
}

async function roundIcon(size) {
  const square = await compose(size, size, 0.62);
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(square).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

// Android başlatıcı simgeleri: eski (kare), yuvarlak ve uyarlanır ön katman (108 dp, güvenli alan 66 dp).
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);
  await write(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, await compose(legacy, legacy, 0.62));
  await write(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, await roundIcon(legacy));
  await write(
    `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`,
    await compose(adaptive, adaptive, 0.5, { transparent: true }),
  );
  // Android 11 ve öncesinin açılış görseli (Android 12+ sistem ekranı rengi ve simgeyi kullanır).
  const portW = Math.round(320 * scale);
  const portH = Math.round(480 * scale);
  await write(`android/app/src/main/res/drawable-port-${density}/splash.png`, await compose(portW, portH, 0.42));
  await write(`android/app/src/main/res/drawable-land-${density}/splash.png`, await compose(portH, portW, 0.42));
}
await write("android/app/src/main/res/drawable/splash.png", await compose(480, 480, 0.42));

// iOS: tek 1024 px simge (Xcode bütün boyutları bundan üretir; saydamlık olmamalı) ve açılış görseli.
await write("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", await compose(1024, 1024, 0.62), { flatten: true });
const splash = await compose(2732, 2732, 0.22);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await write(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, splash, { flatten: true });
}
console.log("mobil simgeler ve açılış görselleri yazıldı");
