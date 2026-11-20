import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_PODCASTS, DEMO_RADIO_ORDER, demoRadioPlaylist, type GuestTrackId } from "@/lib/demo/demo-podcasts";

/*
  Faz 7 (20 Kasım 2026): misafir demosunun branş podcast kesitleri. Her kesit ürünün podcast döngüsüyle branşın tur
  dersinden yazıldı ve ürünün sesleriyle bir kez seslendirildi (ürün sahibinin onayı). Kayıttaki satırlar bölüm
  kaydının (`brans-podcast-<id>.json` → sample) birebir kopyası; ses dosyası `public/ornek/` altında; çalışma anında
  model, ses ya da kredi yok.
*/

const ROOT = process.cwd();

describe("misafir demosu podcast kesitleri", () => {
  it("dört branşın dördünde de kesit var; radyo sırası sabit", () => {
    expect(Object.keys(DEMO_PODCASTS).sort()).toEqual(["hukuk", "lise", "muhendislik", "tus"]);
    expect(demoRadioPlaylist().map((item) => item.src)).toEqual(DEMO_RADIO_ORDER.map((id) => DEMO_PODCASTS[id]!.src));
  });

  it("yeni üç branşın satırları bölüm kaydıyla birebir; ses dosyası var; zaman çizelgesi kesintisiz", () => {
    for (const id of ["muhendislik", "tus", "hukuk"] as GuestTrackId[]) {
      const entry = DEMO_PODCASTS[id]!;
      const record = JSON.parse(readFileSync(path.join(ROOT, `src/lib/demo/brans-podcast-${id}.json`), "utf8"));
      expect(entry.src).toBe(record.sample.src);
      expect(entry.durationMs).toBe(record.sample.durationMs);
      expect(entry.lines.map((line) => ({ ...line }))).toEqual(record.sample.lines);
      // Kesit bölümün içinden: iki satır da üretilen bölümde ardışık geçer.
      const episodeLines = record.episode.chapters.flatMap((chapter: { lines: { text: string }[] }) => chapter.lines.map((line) => line.text));
      const at = episodeLines.indexOf(entry.lines[0]!.text);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(episodeLines[at + 1]).toBe(entry.lines[1]!.text);
      const file = path.join(ROOT, "public", entry.src);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(50_000);
      expect(entry.lines[0]!.startMs).toBe(0);
      expect(entry.lines.at(-1)!.endMs).toBe(entry.durationMs);
      for (let at2 = 1; at2 < entry.lines.length; at2 += 1) expect(entry.lines[at2]!.startMs).toBe(entry.lines[at2 - 1]!.endMs);
      expect(entry.durationMs).toBeGreaterThan(10_000);
      expect(entry.durationMs).toBeLessThan(22_000);
    }
  });
});
