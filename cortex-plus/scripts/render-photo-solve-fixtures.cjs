// Fotoğraftan çözüm ölçüm setinin görsellerini üretir: tests/fixtures/photo-solve/questions.json → <id>.png.
// Fotoğrafa benzesin diye kâğıt rengi, hafif eğim ve bulanıklık eklenir. Çalıştırma: node scripts/render-photo-solve-fixtures.cjs
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const dir = path.join(__dirname, "..", "tests", "fixtures", "photo-solve");
const { items } = JSON.parse(fs.readFileSync(path.join(dir, "questions.json"), "utf8"));
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function render(item, index) {
  const lines = [`${index + 1}. ${item.lines[0]}`, ...item.lines.slice(1), "", ...item.options];
  const lineHeight = 46;
  const width = 1100;
  const height = 120 + lines.length * lineHeight;
  const text = lines
    .map((line, i) => {
      const indent = i > 0 && i < item.lines.length ? 34 : 0;
      return `<text x="${60 + indent}" y="${90 + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#1d1d1f">${escape(line)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f7f3ea"/>${text}</svg>`;
  await sharp(Buffer.from(svg))
    .rotate(index % 2 === 0 ? 1.2 : -0.9, { background: "#d9d4c8" })
    .blur(0.6)
    .png()
    .toFile(path.join(dir, `${item.id}.png`));
}

(async () => {
  for (const [index, item] of items.entries()) await render(item, index);
  console.log(`rendered ${items.length}`);
})();
