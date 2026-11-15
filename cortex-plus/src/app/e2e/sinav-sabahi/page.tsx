import { notFound } from "next/navigation";
import { CramSheetView } from "@/components/parity/cram-sheet-view";
import { buildCramSheet } from "@/lib/learning/cram-sheet";
import { readLessonV3 } from "@/lib/learning/lesson-v3";
import { qrDataUri } from "@/lib/qr";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (15 Kasım 2026, sınav sabahı kâğıdı paketi): gerçek bileşen ve gerçek derleyici, veritabanısız.
 * İçerik yer tutucu biçiminde; konuya özgü terim üretim koduna girmez (bu dosya yalnız fikstür).
 */
export default async function E2eCramSheetPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const lesson = (title: string, blocks: unknown[]) =>
    readLessonV3({ format: 3, title, screens: [{ heading: title, blocks }] })!;
  const sheet = buildCramSheet({
    topics: [
      { key: "t1", label: "Birinci konu" },
      { key: "t2", label: "İkinci konu" },
    ],
    lessons: [
      {
        topicKey: "t1",
        lesson: lesson("Birinci ders", [
          { type: "formula", formula: { title: "Birinci bağıntı", expression: "A = B \\cdot C" } },
          { type: "exam_trap_card", trap: { title: "Karıştırma", wrong: "A ile B aynı büyüklüktür.", right: "A, B ile C'nin çarpımıdır." } },
          { type: "memory_hook_card", hook: { kind: "shortcut", title: "Kısa yol", body: "C artarsa A da artar." } },
        ]),
      },
      {
        topicKey: "t2",
        lesson: lesson("İkinci ders", [
          { type: "formula", formula: { title: "İkinci bağıntı", expression: "D = E / F" } },
          { type: "note", note: { title: "Akılda tut", body: "F sıfır olamaz; bölme tanımsız kalır.", tone: "remember" } },
        ]),
      },
    ],
    examPoints: [{ topicKey: "t2", points: ["Birim yüzeye etki eden niceliğe D denir.", "E ile F sık karıştırılır."] }],
    weakSpots: [{ text: "E büyüdükçe D de büyür; F büyüdükçe D küçülür.", topic: "İkinci konu" }],
    teacherRules: ["Hesaplarda sabit değer 10 olarak alınacaktır."],
  });
  const url = "https://cortexplus.app/hazirlik-davet/ornek";
  const share = { url, whatsappHref: `https://wa.me/?text=${encodeURIComponent(url)}`, qrSrc: await qrDataUri(url, 160) };
  return (
    <main className="dark" style={{ padding: 0 }}>
      <CramSheetView sheet={sheet} prepTitle="Örnek hazırlık" examDay="20 Kasım 2026" homeHref="/e2e/sinav-sabahi" share={share} />
    </main>
  );
}
