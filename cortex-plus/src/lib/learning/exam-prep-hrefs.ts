import { DEFAULT_PODCAST_LENGTH, type PodcastLength } from "@/lib/learning/podcast-formats";
export function examPrepHomeHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}`;
}

/** Kilitli adımın adresi açılınca: hazırlık sayfası o adımı seçili gösterir (18 Ekim 2026). */
export function examPrepLockedHref(prepId: string, nodeId: string) {
  return `${examPrepHomeHref(prepId)}?kilitli=${encodeURIComponent(nodeId)}`;
}

export function examPrepTopicHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/konu`;
}

export function examPrepIntroHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/tanisma`;
}

export function examPrepNodeHref(prepId: string, nodeId: string) {
  return `/deneme-sinavlari/${prepId}/dugum/${nodeId}`;
}

/** "Dersi tekrarla": aynı ders yeniden açılır, yeniden yazılmaz (18 Ekim 2026). */
export function examPrepLessonReplayHref(prepId: string, nodeId: string) {
  return `${examPrepNodeHref(prepId, nodeId)}?tekrar=1`;
}

/** Bitmiş adımın kayıtlı ekranı. Yeni üretim yok, kredi düşmez (25 Ekim 2026). */
export function examPrepSavedReviewHref(prepId: string, nodeId: string) {
  return `${examPrepNodeHref(prepId, nodeId)}?incele=1`;
}

/**
 * "Farklı anlat": bitmiş dersin yeni bir anlatımı yazılır (ücretli). Açık seçim (30 Ekim 2026): bitmiş dersin düz adresi
 * artık kayıtlı dersi açar; canlı turda yer imiyle açılan adres "Ders oluştur" gösterip uyarısız yeni ders yazdırmıştı.
 */
export function examPrepLessonRewriteHref(prepId: string, nodeId: string) {
  return `${examPrepNodeHref(prepId, nodeId)}?farkli=1`;
}

/**
 * Bitmiş ders düğümünün adresi doğrudan açıldı mı (`?incele=1`, `?tekrar=1`, `?farkli=1` ya da `?konu=` yok): kayıtlı
 * hâliyle açılır, yeni yazım yalnız "Farklı anlat" ile. Öbür türler değişmedi.
 */
export function opensSavedLesson(input: {
  kind: string;
  status: string | null | undefined;
  query: { incele?: string; tekrar?: string; farkli?: string; konu?: string; yeni?: string };
}): boolean {
  if (input.query.incele === "1") return true;
  // Faz 4 (%100 ücretsiz yeniden çalışma): bitmiş test, doğru/yanlış, kart ve podcast da kaydından açılır; yeni
  // üretim yalnız açık istekle (`?yeni=1`, "Yeni 8 Kart Üret (8 Kredi)"). Yazılı deneme önce karnesini gösterir.
  if (input.status !== "done" || !SAVED_OPEN_KINDS.has(input.kind)) return false;
  if (input.query.yeni === "1") return false;
  return input.query.tekrar !== "1" && input.query.farkli !== "1" && !input.query.konu?.trim();
}

const SAVED_OPEN_KINDS: ReadonlySet<string> = new Set(["lesson", "quiz", "true_false", "flashcards", "podcast"]);

/** Faz 4: bitmiş adımda açık yeni üretim adresi ("Yeni 8 Kart Üret (8 Kredi)"). */
export function examPrepRegenerateHref(prepId: string, nodeId: string) {
  return `${examPrepNodeHref(prepId, nodeId)}?yeni=1`;
}

/** Bitmiş etkinliğin sonucu (kıyas ürünü: "Sonuçları gör" önceki sonucu açar, etkinliği baştan kurmaz). */
export function examPrepNodeResultHref(prepId: string, nodeId: string) {
  return `/deneme-sinavlari/${prepId}/dugum/${nodeId}/sonuc`;
}

export function examPrepReviewsHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/tekrarlar`;
}

/** Günü gelen tekrar (20 Ekim 2026): bugünün oturumu; yolun dışında, yolu kilitlemez. */
export function examPrepDueReviewHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/tekrar`;
}

/** Faz 4: ücretsiz hedefli tekrar (Zayıf / Gelişiyor / tuzak konuların kayıtlı soruları + Yanlışlar Defteri). */
export function examPrepTargetedReviewHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/tekrar?hedef=1`;
}

/** Faz 4: "Yolu Yeniden Çalış (Ücretsiz)" — bitmiş adımlar kayıttan, sıralı ya da karışık sırayla. */
export function examPrepRestudyHref(prepId: string, order: "path" | "mixed" = "path") {
  return `/deneme-sinavlari/${prepId}/yeniden${order === "mixed" ? "?sira=karisik" : ""}`;
}

/** Faz 4: yeni deneme sınavı kurulumu (başlatma + notlandırma tek seferde 17 kredi). */
export function examPrepNewMockHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/deneme/kurulum`;
}

export function examPrepAssessmentHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/degerlendirme`;
}

/**
 * Yoldan bağımsız podcast. Ders oluşturma merkezi bu adrese bağlanır.
 * Konu ve süre verilmezse sayfa konu seçiciyi açar.
 */
export function examPrepPodcastHref(
  prepId: string,
  topicId?: string,
  length?: PodcastLength,
) {
  const params = new URLSearchParams();
  if (topicId) params.set("topicId", topicId);
  if (length && length !== DEFAULT_PODCAST_LENGTH) params.set("length", length);
  const query = params.toString();
  return `/deneme-sinavlari/${prepId}/podcast${query ? `?${query}` : ""}`;
}

/**
 * Tanışma testi hangi durumda zorunlu.
 *
 * Test tüm içeriği kilitliyordu: hiçbir düğüm açılmadan önce 8 soru
 * yanıtlanmak zorundaydı. Ölçüm planı gerçekten iyileştiriyor, ama öğrenciyi
 * ürünün kapısında sınava sokmak yanlış giriş; önce bir şey öğrenip sonra
 * ölçülmek isteyen kişi geri dönüyordu.
 *
 * Erteleyen öğrenci içeriğe girer; hazırlık sayfasında testi hatırlatan bir
 * kart durmayı sürdürür.
 */
export function needsExamIntro(
  introCompletedAt: string | null | undefined,
  nodes: { status: string }[],
  introDeferredAt?: string | null,
) {
  if (introCompletedAt) return false;
  if (introDeferredAt) return false;
  return !nodes.some((node) => node.status === "done");
}
