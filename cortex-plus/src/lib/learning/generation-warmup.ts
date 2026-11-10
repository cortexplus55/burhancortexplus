/**
 * Üretim beklerken zihin ısıtma (25 Ekim 2026). Model çağırmaz, kredi düşmez:
 * konu adından deterministik kartlar ve sınav ipuçları üretir.
 *
 * 10 Kasım 2026: "Refleks" sekmesi konu adından bağımsız sabit bir işlem sorusu gösteriyordu (kart destesi
 * hazırlanırken öğrencinin dersiyle ilgisiz bir soru). Sabit sorular kaldırıldı; refleks sorusu yalnız çağıran
 * yer hazırlığın kendi içeriğinden bir soru verirse (`WarmupQuiz`) gösterilir, yoksa sekme hiç çizilmez.
 */

export type WarmupCard = { front: string; back: string };
export type WarmupTip = { title: string; body: string };
export type WarmupQuiz = { prompt: string; options: string[]; answerIndex: number; why: string };

const TIPS: WarmupTip[] = [
  { title: "Önce istisna", body: "Şıkta 'her zaman' veya 'asla' görürsen önce istisnayı düşün; mutlak ifade çoğu zaman çeldiricidir." },
  { title: "Öncülü parçala", body: "I / II / III sorusunda her ifadeyi ayrı doğrula; 'yalnız I' ile 'I ve II' aynı bilgiden doğmaz." },
  { title: "Karıştırılan ikili", body: "Konunun en sık karıştırılan iki kavramını yan yana koy; ayırt ettiren tek ipucunu söyle." },
  { title: "Sayıyı yaz", body: "Eşik, yaş, süre veya oran soruluyorsa önce kaynaktaki sayıyı hatırla; 'yüksek/düşük' yetmez." },
  { title: "Kökü oku", body: "Kök 'hangisi yanlıştır' mı, 'hangisi doğrudur' mu? Bir kelime bütün şıkları çevirir." },
  { title: "Tablo satırı değil", body: "Tablo satırını ezberlemek soru çözmez; hangi sütunun neyi ayırdığını söyle." },
];

function fold(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hashTopic(topic: string): number {
  const text = fold(topic).toLocaleLowerCase("tr");
  let n = 0;
  for (let i = 0; i < text.length; i += 1) n = (n * 31 + text.charCodeAt(i)) >>> 0;
  return n;
}

/** Konu adından 4 hızlı kart. Konu boşsa genel sınav kartları. */
export function warmupCards(topic: string): WarmupCard[] {
  const label = fold(topic) || "bu konu";
  return [
    { front: `${label} için sınavın en çok sorduğu ayrım nedir?`, back: "Karıştırılan iki kavramı yan yana koy; ayırt ettiren tek ipucunu söyle." },
    { front: `${label} içinde hangi sayı veya eşik ezberlenmeli?`, back: "Kaynaktaki sayıyı birimli yaz; 'yüksek / düşük' deme." },
    { front: `${label} için sık düşülen tuzak nedir?`, back: "'Sakın X ile Y'yi karıştırma' cümlesini kendi sözünle kur." },
    { front: `${label} bir vakada nasıl görünür?`, back: "Kısa bir durum kur: kavram değişse sonuç değişmeli." },
  ];
}

/** Konuya göre kaydırılan ipuçları (aynı konu aynı sırayı verir). */
export function warmupTips(topic: string): WarmupTip[] {
  const start = hashTopic(topic) % TIPS.length;
  return [...TIPS.slice(start), ...TIPS.slice(0, start)];
}
