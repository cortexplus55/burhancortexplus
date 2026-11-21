/*
  Canlı sesli öğretmen ("Konuş", teacher.v2; 21 Kasım 2026, Burhan'ın kararları). Sunucu ve istemcinin ortak sabitleri
  ve uçların sözleşmesi. Bu dosya sunucu anahtarı taşımaz; istemci bileşenleri de okur.

  Akış (ayrıntı `session.ts`):
    1. İstemci mikrofonu açar, WebRTC teklifini (SDP) BİZİM ucumuza gönderir: POST /api/tutor/realtime-session.
    2. Uç oturum, bayrak, plan / deneme kapısı ve ilk dakikanın kredisinden sonra teklifi sunucu anahtarıyla OpenAI'ye
       iletir (POST /v1/realtime/calls, çok parçalı: `sdp` + `session`), cevap SDP'sini döner. İstemciye anahtar gitmez.
    3. İstemci her dakikanın bitiminden REALTIME_TICK_LEAD_SECONDS önce /tick ister: uç bir sonraki dakikanın kredisini
       ayırır; ayıramazsa çağrıyı kapatır. Uç ayrıca son ödenen anın REALTIME_WATCHDOG_GRACE_SECONDS sonrasında
       çağrıyı kendisi kapatır (istemci /tick'i bırakırsa bedava konuşulamasın).
    4. ■ Durdur → /end: çağrı kapanır, son dakika kurala göre kesinleşir ya da iade edilir, konuşma metni sohbete yazılır.
*/

export const REALTIME_MODEL = "gpt-realtime-2.1-mini";

/**
 * Öğretmenin sesi. OpenAI belgesi en iyi kalite için `marin` ve `cedar`'ı öneriyor; canlı denemede (21 Kasım 2026)
 * ikisi de Türkçeyi anlaşılır okudu (ölçüm: kaydedilen sesin yeniden yazıya dökümü öğretmenin metniyle karşılaştırıldı).
 * `marin` sıcak ve sakin bir ders tonu verdiği için seçildi; gerekçe ve sayılar raporda.
 */
export const REALTIME_VOICE = "marin";

/** Öğrencinin konuşmasını yazıya döken model (canlı transkript). */
export const REALTIME_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

export const REALTIME_MINUTE_SECONDS = 60;
/**
 * Dakikanın ödenmesi için geçmesi gereken süre. Başlayan dakika ödenir; ama dakika sınırında basılan "Durdur" ya da
 * bağlantı kurulur kurulmaz kopan oturum, birkaç saniye için 40 kredi ödemesin.
 */
export const REALTIME_MINUTE_GRACE_SECONDS = 5;
/** İstemci bir sonraki dakikayı sınırdan bu kadar önce ister (konuşma kesilmesin). */
export const REALTIME_TICK_LEAD_SECONDS = 5;
/** Ödenen sürenin bitiminden bu kadar sonra /tick gelmediyse sunucu çağrıyı kapatır. */
export const REALTIME_WATCHDOG_GRACE_SECONDS = 15;
/** Ücretsiz hesabın tek seferlik denemesi. */
export const REALTIME_TRIAL_SECONDS = 60;
/** Oturum başına sert tavan. */
export const REALTIME_MAX_SESSION_SECONDS = 30 * 60;
export const REALTIME_MAX_MINUTES = Math.ceil(REALTIME_MAX_SESSION_SECONDS / REALTIME_MINUTE_SECONDS);

/**
 * Bağlantı hiç kurulmadan biten oturum (mikrofon izni sonradan reddedildi, ağ geçmedi): bu süre içinde biterse ilk
 * dakika iade edilir ve deneme geri verilir. Kötüye kullanılmasın diye günde en çok REALTIME_UNCONNECTED_REFUNDS_PER_DAY.
 */
export const REALTIME_UNCONNECTED_WINDOW_SECONDS = 45;
export const REALTIME_UNCONNECTED_REFUNDS_PER_DAY = 3;

/** Konuşurken tahtaya yazılan kart (öğretmenin aracı): oturum başına en çok. */
export const BOARD_CARD_MAX = 6;
export const BOARD_TITLE_MAX = 80;
export const BOARD_BODY_MAX = 400;
export const BOARD_TOOL_NAME = "tahtaya_yaz";

/** /end gövdesinin sınırları (konuşma metni sohbete yazılır). */
export const TRANSCRIPT_TURN_MAX_CHARS = 4000;
export const TRANSCRIPT_MAX_TURNS = 240;
export const TRANSCRIPT_MAX_CHARS = 120_000;
/** SDP teklifi bu boyu geçmez (tipik teklif 4-8 KB). */
export const SDP_MAX_CHARS = 40_000;

export type RealtimeAccess = "paid" | "founder" | "trial";

export type RealtimeEndReason =
  /** Öğrenci ■ Durdur'a bastı ya da sohbetten ayrıldı. */
  | "user"
  /** Dönemin hakkı bitti (bir sonraki dakika ayrılamadı). */
  | "quota"
  /** Ücretsiz denemenin süresi doldu. */
  | "trial_over"
  /** Oturum başına sert tavan. */
  | "max_duration"
  /** Bağlantı koptu ya da kurulamadı. */
  | "disconnected"
  /** Sunucunun bekçisi kapattı (istemci süreyi uzatmadı). */
  | "watchdog"
  /** Aynı öğrenci yeni bir oturum açtı; eskisi kapandı. */
  | "replaced"
  | "error";

export const END_REASONS: readonly RealtimeEndReason[] = [
  "user",
  "quota",
  "trial_over",
  "max_duration",
  "disconnected",
  "watchdog",
  "replaced",
  "error",
];

/** Uçların ret kodları (istemci dostça hâle çevirir; öğrenciye kredi sayısı söylenmez). */
export type RealtimeRefusal =
  | "plus_required"
  | "trial_used"
  | "quota"
  | "busy"
  | "unavailable"
  | "session_gone"
  | "failed";

export type RealtimeFailureCode = RealtimeRefusal | "max_duration" | "trial_over";
export type RealtimeFailure = { ok: false; code: RealtimeFailureCode; message: string };

/** POST /api/tutor/realtime-session gövdesi. */
export type RealtimeCreateBody = { sdp: string; conversationId?: string | null; prepId?: string | null };

export type RealtimeCreateResponse =
  | {
      ok: true;
      sessionId: string;
      /** OpenAI'nin cevap SDP'si. */
      sdp: string;
      access: RealtimeAccess;
      /** Denemede kalan süre (saniye); ücretlide null. */
      trialSeconds: number | null;
      minuteSeconds: number;
      maxSeconds: number;
      tickLeadSeconds: number;
      boardCardMax: number;
    }
  | RealtimeFailure;

/** POST /api/tutor/realtime-session/tick gövdesi: başlatılmak istenen dakika (2, 3, …). */
export type RealtimeTickBody = { sessionId: string; minute: number; usage?: RealtimeUsageSnapshot };

export type RealtimeTickResponse =
  | { ok: true; minute: number; paidSeconds: number }
  | RealtimeFailure;

/** İstemcinin `response.done` ve yazıya döküm olaylarından topladığı kümülatif kullanım (yalnız gider kaydı). */
export type RealtimeUsageSnapshot = {
  textIn: number;
  textOut: number;
  audioIn: number;
  audioOut: number;
  imageIn: number;
  cachedText: number;
  cachedAudio: number;
  cachedImage: number;
  /** Öğrencinin konuşmasının yazıya dökümü: ses jetonu (ya da saniye × 10). */
  transcribeAudio: number;
  responses: number;
};

export function emptyUsage(): RealtimeUsageSnapshot {
  return {
    textIn: 0,
    textOut: 0,
    audioIn: 0,
    audioOut: 0,
    imageIn: 0,
    cachedText: 0,
    cachedAudio: 0,
    cachedImage: 0,
    transcribeAudio: 0,
    responses: 0,
  };
}

export type RealtimeTranscriptTurn = { role: "user" | "assistant"; text: string };

export type BoardCardKind = "formula" | "concept";
export type BoardCard = { id: string; kind: BoardCardKind; title: string; body: string };

/** POST /api/tutor/realtime-session/end gövdesi. */
export type RealtimeEndBody = {
  sessionId: string;
  reason: RealtimeEndReason;
  /** İstemcide bağlantı (veri kanalı ya da öğretmen sesi) hiç kurulmadıysa false. */
  connected: boolean;
  turns: RealtimeTranscriptTurn[];
  /** Tahta kartları; `afterTurn` kartın hangi konuşma sırasından sonra geldiği (turns dizini; yoksa sona). */
  cards?: (Omit<BoardCard, "id"> & { afterTurn?: number })[];
  usage?: RealtimeUsageSnapshot;
};

export type RealtimeEndResponse =
  | { ok: true; conversationId: string | null; seconds: number; chargedMinutes: number; saved: boolean }
  | RealtimeFailure;

/** Ret kodunun öğrenciye görünen metni (kredi sayısı yok; "Plus'ta" dili). */
export const REFUSAL_MESSAGE: Record<RealtimeFailureCode, string> = {
  plus_required: "Ücretsiz denemeni kullandın.",
  trial_used: "Ücretsiz denemeni kullandın.",
  quota: "Bu dönemin çalışma hakkı doldu. Ders burada kalıyor; konuşma sohbete kaydedildi.",
  busy: "Şu an bağlantı kurulamadı. Birkaç saniye sonra yeniden dene.",
  unavailable: "Canlı sesli öğretmen şu an kullanılamıyor.",
  session_gone: "Bu sesli ders sona erdi.",
  failed: "Eğitmene bağlanılamadı. Yeniden dene.",
  max_duration: "Bir sesli derste en çok 30 dakika konuşulabiliyor. Yeni bir derse başlayabilirsin.",
  trial_over: "Ücretsiz deneme süren doldu.",
};
