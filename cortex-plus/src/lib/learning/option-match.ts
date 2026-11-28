/**
 * Şık kimliği (28 Kasım 2026, P0 "B'yi işaretledim, A kırmızı oldu").
 *
 * Testte seçim şık METNİYLE tutulur. Aynı şık iki biçimde dolaşıyordu: oturum paketi öğrenci süzgecinden geçmiş
 * (`studentSafePayload`), "Kontrol et" cevabı (`answer-check`) ise süzülmemiş ham metinle geliyordu; ekran ikisini
 * birebir (`includes`) karşılaştırıyordu. Üstelik `answer-check` cevabı sorunun metnini, şık listesini ve SIRASINI
 * ekrandakinin yerine yazıyor, sunucunun kilitli cevabını da seçimin üstüne yazıyordu. Bu dosya şıkkı görünüm
 * farkından bağımsız tek anahtarla tanır; ekran, kilit ve notlama aynı anahtara bakar.
 *
 * Saf; sunucuda ve tarayıcıda çalışır. Model çağrısı yok.
 */
import { answerKey, selectedOptions } from "@/lib/learning/exam-quiz";
import { sanitizeStudentCopy } from "@/lib/learning/student-copy";

/** Şıkkın kimliği: öğrenci süzgeci + Unicode biçimi + boşluk farkı yok sayılır. Ham ve süzülmüş metin aynı anahtarı verir. */
export function optionMatchKey(text: unknown): string {
  return answerKey(sanitizeStudentCopy(String(text ?? "")));
}

/** `value` şıklardan hangisi (ekrandaki metniyle); yoksa null. */
export function matchOption(options: readonly string[], value: unknown): string | null {
  const key = optionMatchKey(value);
  if (!key) return null;
  return options.find((option) => optionMatchKey(option) === key) ?? null;
}

/**
 * Cevap (metin ya da çok cevaplıda liste) şıkların kendi metinlerine çevrilir; şıklarda karşılığı olmayan değer
 * düşer. Sıra ve tekrar korunmaz (küme).
 */
export function mapToOptions(options: readonly string[], value: unknown): string[] {
  const out: string[] = [];
  for (const item of selectedOptions(value)) {
    const option = matchOption(options, item);
    if (option && !out.includes(option)) out.push(option);
  }
  return out;
}

/** İki cevap aynı şık kümesi mi (görünüm farkı yok sayılır). */
export function sameChoice(left: unknown, right: unknown): boolean {
  const a = [...new Set(selectedOptions(left).map(optionMatchKey).filter(Boolean))].sort();
  const b = [...new Set(selectedOptions(right).map(optionMatchKey).filter(Boolean))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** Soru kökünün kimliği (sunucudaki soru ile ekrandaki soru aynı mı). */
export function stemMatchKey(text: unknown): string {
  return optionMatchKey(text).toLocaleLowerCase("tr");
}

/**
 * Sunucunun anahtar alanlarını ekrandaki soruya yerleştirir. Ekrandaki kök, şık metinleri ve SIRA değişmez:
 * doğru şık(lar) ekrandaki metinlere çevrilir, şık gerekçeleri ekrandaki sıraya dizilir. Kök tutmuyorsa (sunucu
 * başka bir soruyu notladıysa) null döner; çağıran birleştirmez.
 */
export function placeKeyOnShown<T extends { text?: string; options?: string[] }>(
  shown: T,
  server: {
    text?: string;
    options?: string[];
    correct?: string[];
    optionWhy?: string[];
    explanation?: string;
    steps?: string[];
    misconceptionTag?: string;
    voided?: boolean;
    keyFixed?: boolean;
    voidNote?: string;
  },
): (T & Record<string, unknown>) | null {
  const shownOptions = shown.options ?? [];
  if (server.text !== undefined && stemMatchKey(server.text) !== stemMatchKey(shown.text ?? "")) return null;
  const correct = mapToOptions(shownOptions, server.correct ?? []);
  if (!correct.length && !server.voided) return null;
  const serverOptions = server.options ?? [];
  let optionWhy: string[] | undefined;
  if (server.optionWhy?.length && serverOptions.length === server.optionWhy.length) {
    const byKey = new Map(serverOptions.map((option, index) => [optionMatchKey(option), server.optionWhy![index]!] as const));
    const aligned = shownOptions.map((option) => byKey.get(optionMatchKey(option)) ?? "");
    optionWhy = aligned.every(Boolean) ? aligned : undefined;
  }
  return {
    ...shown,
    correct,
    ...(optionWhy ? { optionWhy } : {}),
    ...(server.explanation !== undefined ? { explanation: server.explanation } : {}),
    ...(server.steps !== undefined ? { steps: server.steps } : {}),
    ...(server.misconceptionTag !== undefined ? { misconceptionTag: server.misconceptionTag } : {}),
    ...(server.voided ? { voided: true, keyFixed: server.keyFixed, voidNote: server.voidNote } : {}),
  };
}
