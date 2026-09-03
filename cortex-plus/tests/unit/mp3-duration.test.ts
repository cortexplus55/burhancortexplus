import { describe, expect, it } from "vitest";
import { mp3DurationMs } from "@/lib/audio/mp3-duration";

/**
 * Gerçek bir MP3 çerçevesi kurar. Testin sahte bir sayı doğrulaması yerine
 * asıl çözümlemeyi zorlaması için başlık bit bit yazılıyor.
 */
function frame({
  bitrateIndex = 9, // MPEG1 L3 → 128 kbps
  rateIndex = 0, // 44100
  padding = 0,
} = {}): Uint8Array {
  const header = new Uint8Array(4);
  header[0] = 0xff;
  header[1] = 0xfb; // MPEG1, Layer III, korumasız
  header[2] = (bitrateIndex << 4) | (rateIndex << 2) | (padding << 1);
  header[3] = 0x00;

  const bitrate = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][
    bitrateIndex
  ] * 1000;
  const rate = [44100, 48000, 32000][rateIndex];
  const length = Math.floor((1152 / 8) * (bitrate / rate)) + padding;

  const out = new Uint8Array(length);
  out.set(header, 0);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe("mp3DurationMs", () => {
  it("çerçeve sayısından süre çıkarır", () => {
    // 38 çerçeve × 1152 örnek / 44100 Hz ≈ 992 ms
    const audio = concat(Array.from({ length: 38 }, () => frame()));
    expect(mp3DurationMs(audio)).toBe(Math.round((38 * 1152 / 44100) * 1000));
  });

  // Kestirim yerine çerçeve yürümenin asıl sebebi bu: bit hızı değişince
  // "boyut / bit hızı" kayar, çerçeve sayısı kaymaz.
  it("değişken bit hızında doğru kalır", () => {
    const audio = concat([
      ...Array.from({ length: 10 }, () => frame({ bitrateIndex: 9 })),
      ...Array.from({ length: 10 }, () => frame({ bitrateIndex: 14 })),
    ]);
    expect(mp3DurationMs(audio)).toBe(Math.round((20 * 1152 / 44100) * 1000));
  });

  it("ID3 etiketini atlar", () => {
    const id3 = new Uint8Array(10 + 100);
    id3[0] = 0x49;
    id3[1] = 0x44;
    id3[2] = 0x33;
    id3[9] = 100; // senkron güvenli boyut
    const audio = concat([id3, ...Array.from({ length: 5 }, () => frame())]);
    expect(mp3DurationMs(audio)).toBe(Math.round((5 * 1152 / 44100) * 1000));
  });

  it("dolgu bitini hesaba katar", () => {
    const audio = concat(Array.from({ length: 5 }, () => frame({ padding: 1 })));
    expect(mp3DurationMs(audio)).toBe(Math.round((5 * 1152 / 44100) * 1000));
  });

  it("48 kHz çözer", () => {
    const audio = concat(Array.from({ length: 20 }, () => frame({ rateIndex: 1 })));
    expect(mp3DurationMs(audio)).toBe(Math.round((20 * 1152 / 48000) * 1000));
  });

  // Uydurulmuş bir süre senkronu sessizce bozardı; ölçemiyorsak 0 demeliyiz.
  it("çerçeve yoksa 0 döner", () => {
    expect(mp3DurationMs(new Uint8Array([1, 2, 3, 4, 5]))).toBe(0);
    expect(mp3DurationMs(new Uint8Array(0))).toBe(0);
  });

  it("geçersiz bit hızı indeksini atlar", () => {
    const bad = new Uint8Array(64);
    bad[0] = 0xff;
    bad[1] = 0xfb;
    bad[2] = 0xf0; // bitrateIndex 15 → geçersiz
    expect(mp3DurationMs(bad)).toBe(0);
  });

  it("ArrayBuffer girdisini de kabul eder", () => {
    const audio = concat(Array.from({ length: 5 }, () => frame()));
    const copy = audio.slice().buffer;
    expect(mp3DurationMs(copy)).toBe(mp3DurationMs(audio));
  });
});
