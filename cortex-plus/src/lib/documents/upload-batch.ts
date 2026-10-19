/**
 * Çok dosyalı yükleme (20 Ekim 2026). 7 dosyalık sınav seti sırayla işlenince ~76 sn sürdü (Astra
 * ~30 sn): her fotoğrafın okunması ~11 sn ve sıradakini bekliyordu. Ücretli hesapta en çok üç dosya
 * aynı anda işlenir; kredi ve taranmış sayfa hakkı veritabanında atomik ayrıldığı için güvenli.
 * Ücretsiz hesapta sıra korunur: toplam 5 sayfalık sınır (`free-pages.ts`) belge kaydından sayılıyor,
 * aynı anda başlayan iki dosya ikisi de "5 sayfa kaldı" görebilirdi.
 */
export const PARALLEL_UPLOADS = 3;

/**
 * Öğeleri en çok `limit` iş aynı anda olacak şekilde çalıştırır. Bir iş `false` dönünce yenisi
 * başlatılmaz (süren işler biter) — sıralı akıştaki "ilk hatada dur" davranışı.
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<boolean>,
): Promise<{ succeeded: number; stopped: boolean }> {
  let next = 0;
  let succeeded = 0;
  let stopped = false;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (!stopped && next < items.length) {
      const index = next;
      next += 1;
      const ok = await worker(items[index]!, index);
      if (ok) succeeded += 1;
      else stopped = true;
    }
  });
  await Promise.all(lanes);
  return { succeeded, stopped };
}

/**
 * Paralel işlenen dosyalar bitiş sırasıyla listeye eklenir; seçim sırası geri kurulur. Belge sırası
 * kurs haritasının sırasına girer (ilk belge kursun belgesidir): PDF'i önce seçen öğrencinin
 * haritası fotoğrafla başlamasın. Bu toplu yüklemeden önce eklenmiş olanlar yerinde kalır.
 */
export function inSelectionOrder<M extends { id: string; fileName: string }>(
  materials: readonly M[],
  existingIds: ReadonlySet<string>,
  selectedNames: readonly string[],
): M[] {
  const rank = new Map<string, number>();
  selectedNames.forEach((name, index) => {
    if (!rank.has(name)) rank.set(name, index);
  });
  const kept = materials.filter((material) => existingIds.has(material.id));
  const added = materials
    .filter((material) => !existingIds.has(material.id))
    .map((material, arrival) => ({ material, arrival }))
    .sort(
      (a, b) =>
        (rank.get(a.material.fileName) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.material.fileName) ?? Number.MAX_SAFE_INTEGER) ||
        a.arrival - b.arrival,
    )
    .map((item) => item.material);
  return [...kept, ...added];
}
