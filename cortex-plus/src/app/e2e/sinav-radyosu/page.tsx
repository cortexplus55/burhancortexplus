import { notFound } from "next/navigation";
import { PrepRadio } from "@/components/parity/prep-radio";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (20 Kasım 2026, Faz 7): Sınav Radyosu giriş düğmesi ve sabit radyo çubuğu, veritabanısız. Ses ucu
 * (`/api/learning/exam-prep/radio`) testte `page.route` ile karşılanır. İçerik yer tutucu; tema `localStorage.theme`.
 */
export default function E2eSinavRadyosuPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const items = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Birinci konu · Diyalog bölümü uzun bir başlıkla", topicLabel: "Birinci konu" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "İkinci konu · Özet", topicLabel: "İkinci konu" },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Üçüncü konu · Soru-cevap", topicLabel: "Üçüncü konu" },
  ];
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px", minHeight: "140vh", display: "flex", flexDirection: "column" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>Örnek hazırlık</h1>
      <PrepRadio prepId="33333333-3333-4333-8333-333333333333" prepTitle="Örnek hazırlık" items={items} />
    </div>
  );
}
