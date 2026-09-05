import { describe, expect, it } from "vitest";
import {
  STORAGE_CAP_FREE,
  STORAGE_CAP_PREMIUM,
  fitsInQuota,
} from "@/lib/documents/storage-quota";

const usage = (usedBytes: number, capBytes: number) => ({
  usedBytes,
  capBytes,
  remainingBytes: Math.max(0, capBytes - usedBytes),
});

describe("yükleme alanı tavanı", () => {
  it("boş alanda normal bir dosyayı kabul eder", () => {
    expect(fitsInQuota(usage(0, STORAGE_CAP_FREE), 5 * 1024 * 1024)).toBe(true);
  });

  it("tavanı aşan dosyayı yükleme başlamadan reddeder", () => {
    // Tek dosya sınırı (15 MB) bunu görmüyordu: beş yüz kez 15 MB yükleyen
    // hesap her seferinde geçerli bir dosya gönderiyordu.
    const nearlyFull = usage(STORAGE_CAP_FREE - 1024, STORAGE_CAP_FREE);
    expect(fitsInQuota(nearlyFull, 5 * 1024 * 1024)).toBe(false);
  });

  it("tam tavana oturan dosyayı geçirir", () => {
    const almost = usage(STORAGE_CAP_FREE - 1000, STORAGE_CAP_FREE);
    expect(fitsInQuota(almost, 1000)).toBe(true);
    expect(fitsInQuota(almost, 1001)).toBe(false);
  });

  it("aboneye daha geniş alan verir", () => {
    const used = STORAGE_CAP_FREE + 1;
    expect(fitsInQuota(usage(used, STORAGE_CAP_FREE), 1)).toBe(false);
    expect(fitsInQuota(usage(used, STORAGE_CAP_PREMIUM), 1)).toBe(true);
  });
});
