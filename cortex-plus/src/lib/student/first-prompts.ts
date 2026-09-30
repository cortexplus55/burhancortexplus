/**
 * Ana sayfadaki Başla düğmesinin göndereceği ilk mesaj.
 * Kayıt sırasındaki sınıf / ders / hedef ile kişiselleşir.
 * AI'ya ürettirilmez: her açılışta kredi yakmamak için sabit şablon.
 *
 * Boş ekrandaki üç kısayol ve alt satır 30 Eylül 2026'da kalktı: Astra'nın
 * ana sayfasında yalnızca selam ve Başla var.
 */
export function defaultStartPrompt({
  grade,
  subject,
  goal,
}: {
  grade?: string | null;
  subject?: string | null;
  goal?: string | null;
}): string {
  const ders = (subject ?? "").trim();
  const sinif = (grade ?? "").trim();
  const hedef = (goal ?? "").trim();
  const seviye = sinif ? `${sinif} ` : "";
  const konu = ders || "bugün çalışacağım konu";
  if (hedef.startsWith("YKS") || hedef.startsWith("LGS")) {
    const shortGoal = hedef.split(/[—\-|]/)[0].trim();
    return `${shortGoal} için ${seviye}${konu} çalışmak istiyorum. Kısa bir tanışma sorusu sor, sonra birlikte bir başlangıç noktası seçelim.`;
  }
  if (ders) {
    return `${seviye}${ders} çalışmak istiyorum. Önce bir soruyla seviyemi yokla, sonra bugün için tek bir net hedef öner.`;
  }
  return "Bugün verimli bir çalışma başlatmak istiyorum. Bana tek bir soru sorup neye odaklanacağımı birlikte seçelim.";
}
