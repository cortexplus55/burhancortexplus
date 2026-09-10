export function examPrepHomeHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}`;
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

export function examPrepReviewsHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/tekrarlar`;
}

export function examPrepAssessmentHref(prepId: string) {
  return `/deneme-sinavlari/${prepId}/degerlendirme`;
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

/** Ölçüm hâlâ eksik — hazırlık sayfasında hatırlatılır. */
export function examIntroPending(
  introCompletedAt: string | null | undefined,
  introDeferredAt?: string | null,
) {
  return !introCompletedAt && Boolean(introDeferredAt);
}
