import { UploadError, uploadDocumentFile } from "@/lib/documents/upload-client";
import { buildPhotoSet, splitSelection, type PhotoSetPart } from "@/lib/documents/photo-set-client";
import { expandLargePdfs } from "@/lib/documents/pdf-split-client";
import type { PhotoPage } from "@/lib/documents/photo-set-pdf";
import { runPool, type PoolOutcome } from "@/lib/documents/upload-batch";
import { flagLowQualityPhotos, type PhotoQuality, type PhotoQualityChoice } from "@/lib/documents/photo-quality";

/**
 * Ortak yükleme motoru (31 Ekim 2026, ürün sahibi: "bütün yükleme kapıları tek mimaride"). Kurulum sihirbazı,
 * telefondan yükleme, hazırlığa materyal ekleme, stüdyolar ve sohbet aynı yoldan yükler:
 *
 * - Fotoğraflar (2+) tek taranmış PDF olur; hızlı başlatmada ilk sayfalar, kalanı küçültülürken hemen gider.
 * - Her dosya şeritlerle (ücretli hesapta 6, ücretsizde sırayla); bir dosyanın düşmesi öbürlerini durdurmaz, yalnız hak
 *   dolunca ("stop") yenisi başlamaz.
 * - Ağ kopması, zaman aşımı, 5xx ve 429 o dosya için 3 kez yeniden denenir (1, 3, 8 sn); doğrulama reddi denenmez.
 * - Belgeyi işlemek (okutmak, haritalamak, hazırlığa bağlamak) yüzeyin işidir: `process` geri çağrısı.
 *
 * Ekranı uyanık tutmak `use-screen-awake.ts`'te (React kancası); bu dosya React'siz ve sınanabilir.
 */

export const UPLOAD_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

function retryable(error: unknown): boolean {
  if (error instanceof UploadError) return error.retryable;
  // Tanınmayan hata (ör. fetch'in TypeError'ı) ağ kopması sayılır.
  return error instanceof TypeError;
}

/** Bir dosyayı yükler; geçici hatada aynı dosya en çok `attempts` kez denenir. */
export async function uploadWithRetry(
  file: File,
  options: {
    upload?: (file: File) => Promise<{ documentId: string }>;
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {},
): Promise<{ documentId: string }> {
  const upload = options.upload ?? uploadDocumentFile;
  const attempts = Math.max(1, options.attempts ?? UPLOAD_ATTEMPTS);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await upload(file);
    } catch (error) {
      if (attempt >= attempts || !retryable(error)) throw error;
      options.onRetry?.(attempt, error);
      await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]!);
    }
  }
}

export type PhotoProgress = { encoded: number; total: number; pagesRead: number; reading: boolean };
export type FileProgress = { done: number; total: number; reading: string[] };

export type PipelineConfig = {
  /** Aynı anda yüklenen/işlenen tek dosya. */
  lanes: number;
  /** Fotoğraflar tek belgede birleşsin mi (ödev/sohbet görselinde hayır). */
  photoSet: boolean;
  /** Fotoğraf setinin ilk sayfaları ayrı parça olarak hemen gitsin mi (kurulumda ücretli hesap). */
  fastStart: boolean;
  /** Yüzey tek belge alıyor (stüdyo): fotoğraflar set olur, değilse yalnız ilk dosya. */
  single?: boolean;
  /** Sınama: fotoğrafı sete hazırlayan işlev (tarayıcıda `encodePhotoPage`). */
  encode?: (file: File) => Promise<PhotoPage | null>;
  /** Sınama: büyük PDF'i parçalarına açan işlev (tarayıcıda `expandLargePdfs`). */
  expandPdf?: (files: readonly File[]) => Promise<File[]>;
  /** Sınama: fotoğrafın netlik ölçüsü (tarayıcıda `assessPhotoQuality`). */
  assessPhoto?: (file: File) => Promise<PhotoQuality | null>;
};

export type PipelineItem = { file: File; part?: PhotoSetPart };

export type PipelineHandlers = {
  /** Yüklemeden önce: uygunsuz dosya için öğrenciye söylenecek cümle (dosya atlanır). */
  validate?: (file: File) => string | null;
  /** Yükleme ucu (telefon sayfası imzalı yüklemesini verir); yoksa `uploadDocumentFile`. */
  upload?: (file: File) => Promise<{ documentId: string }>;
  /** Yükleme başlarken (kimlik henüz yok) ve kimlik gelince: kurulumun "yolda olan" kaydı. */
  onUploadStart?: (item: PipelineItem) => (documentId: string | null) => void;
  /**
   * Yüklemeden önce: bulanık ya da karanlık görünen fotoğraflar için öğrenciye sorulur. "retake" işaretlenenleri bu
   * seçimden çıkarır (öğrenci yeniden çeker), "use" olduğu gibi sürer. Yoksa soru sorulmaz.
   */
  reviewPhotos?: (flagged: File[], all: File[]) => Promise<PhotoQualityChoice>;
  /** Yüklenen belgeyi yüzey işler; sayfa ilerlemesini `onPages` ile bildirir. */
  process: (input: {
    documentId: string;
    item: PipelineItem;
    onPages: (done: number, total: number) => void;
  }) => Promise<PoolOutcome>;
};

export type PipelineReport = {
  photos?: (progress: PhotoProgress | null) => void;
  files?: (progress: FileProgress | null) => void;
};

export type PipelineResult = {
  /** Belgelerin seçim sırası (ad): fotoğraf seti seçimdeki ilk fotoğrafın yerinde. */
  order: string[];
  failed: string[];
  /** İlk hatanın öğrenciye söylenecek cümlesi (uygunsuz dosya ya da yükleme hatası). */
  firstError: string | null;
  stopped: boolean;
  succeeded: number;
};

/**
 * Bulanık / karanlık fotoğraf denetimi: ölçü kısa bir bütçe içinde (`flagLowQualityPhotos`), işaretli fotoğraf yoksa
 * soru yok. Soru düşerse ya da ölçü yapılamazsa seçim olduğu gibi yüklenir — denetim yüklemeyi hiçbir zaman durdurmaz.
 */
export async function screenPhotoQuality(
  files: File[],
  options: Pick<PipelineConfig, "assessPhoto"> & Pick<PipelineHandlers, "reviewPhotos">,
): Promise<File[]> {
  if (!options.reviewPhotos) return files;
  let flagged: File[] = [];
  try {
    flagged = await flagLowQualityPhotos(files, { assess: options.assessPhoto });
  } catch {
    return files;
  }
  if (!flagged.length) return files;
  const choice = await options.reviewPhotos(flagged, files).catch((): PhotoQualityChoice => "use");
  return choice === "retake" ? files.filter((file) => !flagged.includes(file)) : files;
}

/** Seçimi yükler ve işletir. Hiçbir dosya ötekini düşürmez; sonuç sırası seçimdir. */
export async function runUploadPipeline(
  selection: File[],
  config: PipelineConfig,
  handlers: PipelineHandlers,
  report: PipelineReport = {},
): Promise<PipelineResult> {
  const files = await screenPhotoQuality(selection, { assessPhoto: config.assessPhoto, reviewPhotos: handlers.reviewPhotos });
  const split = config.photoSet ? splitSelection(files) : { photos: [] as File[], others: files };
  const photos = split.photos;
  const picked = config.single ? (photos.length ? [] : split.others.slice(0, 1)) : split.others;
  // 50 MB'tan büyük PDF parçalarına açılır (pdf-split-client.ts, 31 Ekim 2026): her parça ayrı belge, sırası kitabın.
  const expanded = await (config.expandPdf ?? expandLargePdfs)(picked);
  const others = config.single ? expanded.slice(0, 1) : expanded;
  const failed: string[] = [];
  let firstError: string | null = null;
  let stopped = false;
  let succeeded = 0;

  const handleOne = async (item: PipelineItem, onPages: (done: number, total: number) => void): Promise<PoolOutcome> => {
    const { file } = item;
    if (stopped) return "stop";
    const problem = handlers.validate?.(file) ?? null;
    if (problem) {
      firstError = firstError ?? problem;
      failed.push(file.name);
      return false;
    }
    const settle = handlers.onUploadStart?.(item);
    let documentId: string;
    try {
      documentId = (await uploadWithRetry(file, { upload: handlers.upload })).documentId;
    } catch (error) {
      settle?.(null);
      if (error instanceof UploadError && error.stop) {
        stopped = true;
        return "stop";
      }
      firstError = firstError ?? (error instanceof Error ? error.message : null);
      failed.push(file.name);
      return false;
    }
    settle?.(documentId);
    try {
      const outcome = await handlers.process({ documentId, item, onPages });
      if (outcome === "stop") stopped = true;
      if (outcome === true) succeeded += 1;
      else if (outcome === false) failed.push(file.name);
      return outcome;
    } catch {
      failed.push(file.name);
      return false;
    }
  };

  // Fotoğraf seti: parçalar hazır olur olmaz yüklenir; küçültme sürerken ilk parça okunmaya başlar.
  const partNames: string[] = [];
  const runPhotos = async () => {
    if (!photos.length) return;
    const reads = new Map<number, number>();
    let encoded = 0;
    let reading = false;
    const tell = () =>
      report.photos?.({
        encoded,
        total: photos.length,
        pagesRead: [...reads.values()].reduce((sum, value) => sum + value, 0),
        reading,
      });
    tell();
    const parts: Promise<PoolOutcome>[] = [];
    const { leftovers } = await buildPhotoSet(photos, {
      fastStart: config.fastStart && !config.single,
      encode: config.encode,
      onEncoded: (done) => {
        encoded = done;
        tell();
      },
      onPart: (part) => {
        partNames.push(part.file.name);
        reading = true;
        reads.set(part.from, 0);
        tell();
        parts.push(
          handleOne({ file: part.file, part }, (done) => {
            reads.set(part.from, Math.min(done, part.pages));
            tell();
          }).then((outcome) => {
            if (outcome === true) reads.set(part.from, part.pages);
            tell();
            return outcome;
          }),
        );
      },
    });
    // Tarayıcının çözemediği fotoğraf (HEIC'i çözemeyen tarayıcı) tek dosya olarak gider.
    const rest = config.single ? (parts.length ? [] : leftovers.slice(0, 1)) : leftovers;
    partNames.push(...rest.map((file) => file.name));
    await Promise.all([
      ...parts,
      rest.length ? runPool(rest, config.lanes, (file) => handleOne({ file }, () => {})) : null,
    ]);
  };

  const runOthers = async () => {
    if (!others.length) return;
    const reading: string[] = [];
    let done = 0;
    const tell = () => report.files?.({ done, total: others.length, reading: [...reading] });
    tell();
    await runPool(others, config.lanes, async (file) => {
      reading.push(file.name);
      tell();
      const outcome = await handleOne({ file }, () => {});
      reading.splice(reading.indexOf(file.name), 1);
      if (outcome === true) done += 1;
      tell();
      return outcome;
    });
  };

  try {
    await Promise.all([runPhotos(), runOthers()]);
  } finally {
    report.photos?.(null);
    report.files?.(null);
  }

  const firstPhoto = photos.length ? files.indexOf(photos[0]!) : -1;
  const firstOther = picked.length ? files.indexOf(picked[0]!) : -1;
  const otherNames = others.map((file) => file.name);
  const order = firstPhoto >= 0 && (firstOther < 0 || firstPhoto < firstOther)
    ? [...partNames, ...otherNames]
    : [...otherNames, ...partNames];
  return { order, failed, firstError, stopped, succeeded };
}
