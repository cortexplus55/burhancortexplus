import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { studentOutputText } from "@/lib/learning/student-output-firewall";
import { EMPHASIS_RULE } from "@/lib/learning/teacher-lesson";
import { STUDENT_LEAK_BAN } from "@/lib/learning/teaching-rubric";

/*
  Paket I #5 (30 Ekim 2026). Stres testinde öğrenciye ürünün kendi istem dili ve kaynağın iç notları sızdı. Süzgeç
  yalnız siler, cümle yazmaz; benzer görünen gerçek içerik cümlesi (kimyada "turuncu renk", hukukta "işlenmez")
  kalır.
*/

describe("canlıda görülen sızıntılar silinir", () => {
  it("renk anahtarı, kapsam notu, alıştırma numarası, dönem satırı ve iç etiketler", () => {
    const cases: Array<[string, string]> = [
      ["Turuncu işaretli yerler sınavda çıkar. Aktif hesaplar borç tarafında artar.", "Aktif hesaplar borç tarafında artar."],
      [
        "Yevmiye defteri tarih sırasıyla tutulur. Tekrar soruları ile boş ödev tablosu bu anlatımda ele alınmıyor.",
        "Yevmiye defteri tarih sırasıyla tutulur.",
      ],
      ["En kısa yolu bulun (Alıştırma 11.5).", "En kısa yolu bulun."],
      ["Alıştırma 9.1: Yığına 3, 5, 7 eklenir.", "Yığına 3, 5, 7 eklenir."],
      ["Dönem: 2026–2027\nMizan dönem sonunda çıkarılır.", "Mizan dönem sonunda çıkarılır."],
      ["Ders: Muhasebe · Dönem: 2026\nKDV oranı %20'dir.", "KDV oranı %20'dir."],
      ["Şekilde işaretli değerler: A-B 4, B-C 7", "A-B 4, B-C 7"],
      ["SINAVDA SORULUR: Ateşli nöbet 6 ay-5 yaş arasında görülür.", "Ateşli nöbet 6 ay-5 yaş arasında görülür."],
    ];
    for (const [input, expected] of cases) expect(studentOutputText(input)).toBe(expected);
  });

  it("gerçek içerik cümleleri kalır", () => {
    const keep = [
      "Metil oranj bazik ortamda turuncu renk verir.",
      "Bu bölümdeki suçlar taksirle işlenmez.",
      "Bu derste ele alınan üç kavram birbirine bağlıdır.",
      "Dönem sonu envanteri 31 Aralık'ta çıkarılır.",
      "Örnek: Kasa hesabı 5.000 TL borçlandırılır.",
    ];
    for (const sentence of keep) expect(studentOutputText(sentence)).toBe(sentence);
  });
});

describe("istem kaynağı kapandı", () => {
  it("yazar renk anahtarını bilmez; yasak listesi yeni kalıpları sayar", () => {
    expect(EMPHASIS_RULE).not.toMatch(/turuncu/i);
    for (const phrase of ["turuncu işaretli yerler", "ele alınmadığını söyleme", "kişi adı uydurma", "Alıştırma 11.5"]) {
      expect(STUDENT_LEAK_BAN).toContain(phrase);
    }
  });

  it("video alt yazısı ve kilit bilgi de süzgeçten geçer", () => {
    const video = readFileSync("src/components/parity/video-lesson.tsx", "utf8");
    expect(video).toContain("narration: studentOutputText(item.narration)");
    expect(video).toContain("keyFact: studentOutputText(item.keyFact)");
  });
});
