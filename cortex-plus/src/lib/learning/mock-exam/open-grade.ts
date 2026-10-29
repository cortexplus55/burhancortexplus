/**
 * Yazılı denemenin açık uçlu cevapları (17 Ekim 2026, ürün sahibinin kararı: Astra gibi).
 *
 * Astra kâğıttaki el yazısını okuyup yapay zekâyla notluyor. Bizde `gradeRubricAnswer`
 * zaten "her ölçüt için cevaptan birebir alıntı" bekliyordu ama alıntıyı üreten bir model
 * hiç bağlanmamıştı; yerine kelime eşleştirmesi vardı ("Ana fikir" ölçütü öğrencinin
 * cevabında geçmediği için doğru cevap yanlış sayılıyordu). Model her ölçütü cevapta
 * arar ve karşılayan parçayı aynen alıntılar; alıntı cevapta yoksa ölçüt karşılanmamış
 * sayılır (uydurma alıntı puan getirmez). Puanı kod hesaplar.
 */

export type OpenGradeItem = {
  question: string;
  criteria: string[];
  modelAnswer: string;
  answer: string;
};

export type OpenJudgement = {
  quotes: { criterion: string; quote: string }[];
  trustedCriteria: string[];
  /** Öğrencinin AÇIKÇA yanlış söylediği ölçütler (eksik bırakılan değil): tam puan kuralını kapatır. */
  contradicted: string[];
};

export const OPEN_GRADE_SYSTEM =
  "Sen titiz ve adil bir öğretmensin; yazılı sınavın açık uçlu cevaplarını notluyorsun. Her soruda ÖLÇÜTLER iyi bir " +
  "cevabın içermesi gereken noktalardır; ÖRNEK CEVAP yalnız yol gösterir.\n" +
  "Her ölçüt için öğrencinin cevabına bak:\n" +
  "- Cevap o noktayı doğru söylüyorsa (farklı sözcükle, eş anlamlıyla, kısaltmayla da olur) met: true ve quote: " +
  "cevaptan o noktayı söyleyen kısa parça, BİREBİR kopya, en çok 15 kelime.\n" +
  "- Söylemiyorsa ya da yanlış, çelişkili söylüyorsa met: false, quote boş.\n" +
  "Cevapta olmayanı varsayma; ölçütü yalnız tekrar eden içi boş cümle karşılamaz. Yazım ve el yazısı okuma hatalarını " +
  "cezalandırma. Fazladan doğru bilgi puan getirmez; bir noktayı yanlış söyleyen cevap o ölçütü karşılamaz. " +
  "Yöntem, formül ve denklem kurulumu doğruysa o ölçüt met: true olur; son aritmetik hata yalnız sonuç ölçütünü düşürür. " +
  "Öğrencinin cevabı beklenen sonucu ve yöntemi birlikte veriyorsa bütün ölçütler met: true olur ve tam puan verilir; " +
  "alıntı birebir olmasa da kesinti yapma. Yalnız son sayıyı yazan cevap yöntem ölçütünü karşılamaz. " +
  "Açık tarih ya da olgu hatası o ölçütte met: false.\n" +
  "- Öğrenci o noktayı AÇIKÇA yanlış söylüyorsa (yanlış işlem, yanlış kavram, çelişen sayı ya da tarih) met: false ve wrong: true; " +
  "yalnız eksik bıraktıysa wrong: false.\n" +
  "Çözümün kısa ya da özet olması kesinti sebebi değildir: sonuç doğru ve kurduğu bağıntı/gerekçe doğruysa \"adımları gösterir\", " +
  "\"ara işlemleri yazar\" türü ölçütler de met: true olur.\n" +
  'Yalnızca JSON döndür: {"items":[{"index":0,"criteria":[{"index":0,"met":true,"wrong":false,"quote":"…"}]}]}';

export function openGradeUserPrompt(items: OpenGradeItem[]): string {
  return items
    .map((item, index) =>
      [
        `SORU ${index} (index=${index}): ${item.question}`,
        `ÖLÇÜTLER:\n${item.criteria.map((criterion, j) => `${j}. ${criterion}`).join("\n")}`,
        item.modelAnswer ? `ÖRNEK CEVAP: ${item.modelAnswer}` : "",
        `ÖĞRENCİNİN CEVABI: ${item.answer}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/** Model çıktısı → soru başına karşılanan ölçütlerin alıntıları. Bozuk satır düşer. */
export function parseOpenGrade(raw: unknown, items: OpenGradeItem[]): Map<number, OpenJudgement> {
  const out = new Map<number, OpenJudgement>();
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const index = Number(row.index);
    const item = items[index];
    if (!Number.isInteger(index) || !item || out.has(index)) continue;
    const criteria = Array.isArray(row.criteria) ? row.criteria : [];
    const quotes = criteria.flatMap((value) => {
      const cell = (value ?? {}) as Record<string, unknown>;
      const criterion = item.criteria[Number(cell.index)];
      const quote = typeof cell.quote === "string" ? cell.quote.trim() : "";
      return cell.met === true && criterion && quote ? [{ criterion, quote }] : [];
    });
    const contradicted = criteria.flatMap((value) => {
      const cell = (value ?? {}) as Record<string, unknown>;
      const criterion = item.criteria[Number(cell.index)];
      return cell.met !== true && cell.wrong === true && criterion ? [criterion] : [];
    });
    out.set(index, { quotes, trustedCriteria: [], contradicted });
  }
  return out;
}
