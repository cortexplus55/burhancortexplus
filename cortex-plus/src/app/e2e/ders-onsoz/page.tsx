import { notFound } from "next/navigation";
import { poolLessonV3 } from "@/lib/content-pool/serve";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import { DersOnsozFixture } from "./fixture";
// Ders oturumunun sarmalayıcısı (.cp-exam-page: yan boşluk) gerçek sayfadaki gibi.
import "@/styles/parity-shell.css";

export const dynamic = "force-dynamic";

/**
 * Konu başı ve sonu fikstürü (28 Kasım 2026): gerçek ders ekranı (`ExamLessonSteps`), önsöz ve kapanış açık.
 *
 * `?kaynak=havuz`: hazır müfredat dersi (`poolLessonV3` ile kurulur, havuzun biçimi). Varsayılan: not dersi.
 * `?durum=baslanmis`: ders daha önce başlanmış (önsöz kendiliğinden gelmez, "Ders özeti" ile açılır).
 * `?plan=ucretsiz`: Sınav Sabahı Kağıdı bağlantısında Plus rozeti.
 */
const NOTE = {
  format: 3,
  title: "Köklü Sayılar",
  overview: "Kökün dışına çıkarma, kök içine alma ve sıralama.",
  screens: [
    {
      heading: "Kök dışına çıkarma",
      concept: "Kök dışına çıkarma",
      lead: "Tam kare çarpan kökün dışına çıkar.",
      blocks: [
        { type: "text", text: "Kökün içindeki sayıyı **tam kare çarpan** ile başka bir çarpanın çarpımı olarak yaz; tam kare çarpan kökün dışına çıkar: $\\sqrt{12} = \\sqrt{4 \\cdot 3} = 2\\sqrt{3}$." },
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
          type: "check",
          check: { type: "mcq", prompt: "√50 ifadesinin en sade hâli hangisidir?", options: ["5√2", "2√5", "25√2", "10√5", "5√10"], answerIndex: 0, explanation: "50 = 25 · 2 ve √25 = 5." },
        },
      ],
    },
    {
      heading: "Kök içine alma",
      concept: "Kök içine alma",
      lead: "Dıştaki katsayı karesiyle köke girer.",
      blocks: [{ type: "text", text: "Dıştaki sayının **karesi** alınıp kökün içiyle çarpılır: $3\\sqrt{2} = \\sqrt{18}$. **Kök derecesi** değişmez." }],
    },
    {
      heading: "Köklü sayıları sıralama",
      concept: "Köklü sayıları sıralama",
      lead: "Hepsini kök içine al, içleri karşılaştır.",
      blocks: [{ type: "text", text: "Hepsini aynı biçime getir: $2\\sqrt{3} = \\sqrt{12}$ ve $3\\sqrt{2} = \\sqrt{18}$; içi büyük olan büyüktür." }],
    },
    {
      heading: "Paydayı rasyonel yapma",
      concept: "Paydayı rasyonel yapma",
      lead: "Paydadaki kök eşleniğiyle çarpılarak kaldırılır.",
      blocks: [{ type: "text", text: "Pay ve payda paydadaki kökün **eşleniği** ile çarpılır: $\\frac{1}{\\sqrt{2}} = \\frac{\\sqrt{2}}{2}$." }],
    },
  ],
  summary: [
    "Tam kare çarpan kökün dışına çıkar: √12 = 2√3.",
    "Kök yalnız çarpıma dağılır; toplamı ayırmaz.",
    "Sıralarken hepsini kök içine al, içleri karşılaştır.",
    "Paydadaki kök eşleniğiyle çarpılarak kaldırılır.",
  ],
  nextFocus: ["Konu testi: Köklü sayılar"],
} as unknown as LessonV3;

const POOL_BODY = {
  title: "Basit Makineler",
  overview: "Kaldıraç, makara ve eğik düzlem kuvvetten kazanç sağlar ama işten kazanç sağlamaz.",
  sections: [
    {
      outcome_code: "F.8.5.1",
      heading: "Kaldıraçlar",
      explanation: "Kaldıraçta yükün ve kuvvetin desteğe uzaklıkları kuvvet kazancını belirler. Kuvvet kolu uzadıkça gereken kuvvet azalır.",
      key_points: ["Kuvvet × kuvvet kolu = yük × yük kolu"],
      common_mistakes: ["Kuvvetten kazanç sağlayan makinenin işten de kazanç sağladığını sanmak"],
    },
    {
      outcome_code: "F.8.5.2",
      heading: "Makaralar",
      explanation: "Sabit makara kuvvetin yönünü değiştirir, hareketli makara kuvvetten kazanç sağlar. Palangada yükü taşıyan ip sayısı kazancı gösterir.",
      key_points: ["Hareketli makarada kuvvet yükün yarısıdır"],
    },
    {
      outcome_code: "F.8.5.3",
      heading: "Eğik Düzlem",
      explanation: "Eğik düzlemde yol uzadıkça gereken kuvvet azalır. Yapılan iş değişmez.",
      key_points: ["Kuvvet × yol = yük × yükseklik"],
    },
  ],
  summary: "Basit makineler kuvvetten kazanç sağlar. Hiçbir basit makine işten kazanç sağlamaz. Kazanç kol ya da yol uzunluğuyla artar.",
  key_terms: [
    { term: "Kuvvet kazancı", definition: "Yükün uygulanan kuvvete oranı." },
    { term: "Destek noktası", definition: "Kaldıracın döndüğü nokta." },
    { term: "Palanga", definition: "Sabit ve hareketli makaraların birlikte kullanıldığı düzenek." },
  ],
  cards: [{ front: "Kuvvet kazancı", back: "Yük / kuvvet" }],
};

export default async function DersOnsozPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  const lesson = params.kaynak === "havuz" ? (poolLessonV3(POOL_BODY as never, "Basit Makineler") as unknown as LessonV3) : NOTE;
  return (
    <DersOnsozFixture
      lesson={sealLessonV3ForPlay(lesson)}
      autoOpen={params.durum !== "baslanmis"}
      cramLocked={params.plan === "ucretsiz"}
    />
  );
}
