/**
 * Bölümün gövde dışındaki yapılandırılmış içeriği, düz metin olarak.
 *
 * Formül kartı, sıralı işlem ve karşılık tablosu `body`'nin dışında duruyor
 * (üretim promptu modele bunları gövdeye ikinci kez yazmamasını söylüyor).
 * Dersi yalnızca `heading` + `body` üzerinden okuyan her tüketici —
 * dersten türetilen podcast, sohbetin ders bağlamı — bu yüzden bölümün asıl
 * bilgisini kaçırıyordu: 4 adımlık bir hesap ya da bir eşik tablosu sesli
 * hâlde ve sohbette kısa bir özete iniyordu.
 *
 * Etiketler bilerek cümle biçiminde: podcast brief'indeki her ad bölüm
 * başlığına dönüşme eğiliminde ve "Adımlar" şablon adları listesinde
 * (isScaffoldHeading). Kısa bir "Adımlar:" etiketi podcast üretimini
 * kilitlerdi (bkz. podcast-from-lesson.ts, "Kontrol Noktası").
 */

import type { LessonV2 } from "@/lib/learning/teaching-standards";

export function lessonSectionDetails(section: LessonV2["sections"][number]): string[] {
  const lines: string[] = [];
  if (section.formula) {
    const note = section.formula.note ? ` (${section.formula.note})` : "";
    lines.push(`bu bölümde kullanılan bağıntı, ${section.formula.title}: ${section.formula.expression}${note}`);
  }
  if (section.procedure) {
    const steps = section.procedure.steps
      .map((step, index) => `${index + 1}) ${step.label}: ${step.detail}`)
      .join("; ");
    lines.push(`bu bölümde sırayla yapılan işlem: ${steps}`);
  }
  if (section.table) {
    const { columns, rows } = section.table;
    const pairs = rows
      .map((row) => columns.map((column, index) => `${column} ${row[index] ?? ""}`.trim()).join(", "))
      .join("; ");
    lines.push(`bu bölümdeki karşılıklar: ${pairs}`);
  }
  return lines;
}
