import { notFound } from "next/navigation";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import { CanliDefterFixture } from "./fixture";
// Ders oturumunun sarmalayıcısı (.cp-exam-page: yan boşluk) gerçek sayfadaki gibi.
import "@/styles/parity-shell.css";

export const dynamic = "force-dynamic";

/**
 * Canlı Defter Modu fikstürü (28 Kasım 2026). Ders: kelime metni, kalın terim, "==kilit==" vurgu, satır içi formül,
 * formül kartı, sınav ipucu, sınav tuzağı, hafıza çivisi, soru ve "Bu Konudan Aklında Kalsın".
 *
 * `?durum=baslanmis`: ders daha önce başlanmış (yazım kendiliğinden başlamaz, metin tam açık gelir).
 */
const LESSON = {
  format: 3,
  title: "Köklü Sayılar",
  overview: "Kökün dışına çıkarma, kök içine alma ve paydayı rasyonel yapma.",
  screens: [
    {
      heading: "Kök dışına çıkarma",
      concept: "Kök dışına çıkarma",
      lead: "Tam kare çarpan kökün dışına çıkar.",
      blocks: [
        {
          type: "text",
          text: "Kökün içindeki sayıyı bir **tam kare çarpan** ile başka bir çarpanın çarpımı olarak yaz. ==Tam kare çarpan kökün dışına çıkar==; geri kalan çarpan kökün içinde kalır: $\\sqrt{12} = \\sqrt{4 \\cdot 3} = 2\\sqrt{3}$. Aynı yol $\\sqrt{50} = 5\\sqrt{2}$ için de geçerlidir.",
        },
        {
          type: "formula",
          formula: {
            title: "Kök dışına çıkarma",
            expression: "$\\sqrt{a^2 \\cdot b} = a\\sqrt{b}$",
            symbols: [
              { symbol: "a", meaning: "tam kare çarpanın kökü" },
              { symbol: "b", meaning: "kökte kalan çarpan" },
            ],
          },
        },
        {
          type: "note",
          note: { title: "Sınav ipucu", body: "Kökün içindeki sayının en büyük tam kare çarpanını ara; sadeleştirme tek adımda biter.", tone: "exam" },
        },
      ],
    },
    {
      heading: "Toplam köke dağılmaz",
      concept: "Kök içine alma",
      lead: "Kök yalnız çarpıma dağılır.",
      blocks: [
        {
          type: "text",
          text: "Kök **çarpıma** dağılır: $\\sqrt{a \\cdot b} = \\sqrt{a} \\cdot \\sqrt{b}$. ==Toplama ise dağılmaz==; kökün içinde toplam varsa önce işlemi yap, sonra kökünü al: $\\sqrt{9 + 16} = \\sqrt{25} = 5$.",
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Toplamı ayırmak",
            wrong: "√(a + b) = √a + √b sanmak",
            right: "Kök yalnız çarpıma dağılır; toplamı ayırmaz.",
            tell: "Kökün içinde toplama işareti varsa önce topla.",
          },
        },
        {
          type: "memory_hook_card",
          hook: { kind: "shortcut", title: "Önce içeri, sonra kök", body: "Kökün içinde işlem varsa sıra hep aynı: önce içerideki işlem, en son kök." },
        },
      ],
    },
    {
      heading: "Paydayı rasyonel yapma",
      concept: "Paydayı rasyonel yapma",
      lead: "Paydadaki kök eşleniğiyle çarpılarak kaldırılır.",
      blocks: [
        {
          type: "text",
          text: "Paydada kök kalmaması için pay ve payda aynı sayıyla çarpılır. Payda $\\sqrt{2}$ ise ikisi de $\\sqrt{2}$ ile çarpılır: $\\frac{1}{\\sqrt{2}} = \\frac{\\sqrt{2}}{2}$. Payda $a + \\sqrt{b}$ biçimindeyse **eşlenik** kullanılır.",
        },
      ],
    },
  ],
  summary: [
    "**Tam kare çarpan** kökün dışına çıkar: √12 = 2√3.",
    "Kök yalnız **çarpıma** dağılır; toplamı ayırmaz.",
    "Paydadaki kök **eşleniğiyle** çarpılarak kaldırılır.",
  ],
  nextFocus: ["Konu testi: Köklü sayılar"],
} as unknown as LessonV3;

export default async function CanliDefterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <CanliDefterFixture lesson={sealLessonV3ForPlay(LESSON)} autoplay={params.durum !== "baslanmis"} />;
}
