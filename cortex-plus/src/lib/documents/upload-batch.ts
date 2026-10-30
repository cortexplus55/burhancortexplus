/**
 * Çok dosyalı yükleme (20 Ekim 2026). 7 dosyalık sınav seti sırayla işlenince ~76 sn sürdü (Astra
 * ~30 sn): her fotoğrafın okunması ~11 sn ve sıradakini bekliyordu. Kredi ve taranmış sayfa hakkı
 * veritabanında atomik ayrıldığı için ücretli hesapta paralel güvenli. Ücretsiz hesapta sıra korunur:
 * toplam 5 sayfalık sınır (`free-pages.ts`) belge kaydından sayılıyor, aynı anda başlayan iki dosya ikisi
 * de "5 sayfa kaldı" görebilirdi.
 *
 * 31 Ekim 2026 (ürün sahibi: 100 fotoğraf seçti, 8'i alındı, 8'i ~4 dk sürdü): şerit 3 → 6 ve kurucu da
 * ücretli sayılır (önizlemede değil). Ölçüm: telefon fotoğrafı (4080×3060) okuması normal işlemde
 * 18-20 sn, hızlı işlemde 8-9 sn; 6 şeritle 100 fotoğraf ~2-3 dk.
 */
export const PARALLEL_UPLOADS = 6;

/** İşin sonucu: `true` hazır, `false` bu dosya düştü (öbürleri sürer), `"stop"` hak doldu (yenisi başlamaz). */
export type PoolOutcome = boolean | "stop";

/**
 * Öğeleri en çok `limit` iş aynı anda olacak şekilde çalıştırır. Bir dosyanın düşmesi topluluğu durdurmaz
 * (31 Ekim 2026: 100 fotoğrafta tek bulanık fotoğraf arkadakileri kesiyordu); yalnız `"stop"` (hak doldu)
 * yeni iş başlatmaz, süren işler biter.
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<PoolOutcome>,
): Promise<{ succeeded: number; failed: number; stopped: boolean }> {
  let next = 0;
  let succeeded = 0;
  let failed = 0;
  let stopped = false;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (!stopped && next < items.length) {
      const index = next;
      next += 1;
      const outcome = await worker(items[index]!, index);
      if (outcome === true) succeeded += 1;
      else if (outcome === "stop") stopped = true;
      else failed += 1;
    }
  });
  await Promise.all(lanes);
  return { succeeded, failed, stopped };
}

/**
 * Art arda gelen işleri (telefondan tek tek düşen dosyalar) en çok `limit` aynı anda çalıştırır; fazlası sırada
 * bekler. `runPool` listeyi baştan bilir, bu ise iş geldikçe çalışır.
 */
export function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (task) => {
    if (running >= Math.max(1, limit)) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await task();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
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
