/**
 * Yol etkinliği oturumunun tek yaşam döngüsü (30 Ekim 2026): açılış (düğüm başına bir kez), sürdürme, başlatma,
 * cevap kaydı, parça parça yoklama, bitirme, sonuç bekleme ve yoklama. Ekran bileşenleri yalnız çizer; aşama ve
 * istekler burada. `router.refresh()` sunucu özelliklerini yenilese de açılış yeniden koşmaz (`openedForRef`).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { COMPLETE_TIMEOUT_MS, SAVE_RETRY_DELAYS_MS, SAVE_TIMEOUT_MS, fetchWithRetry, isTransportFailure } from "@/lib/learning/retry-fetch";
import { answerSaveSummary, clearAttemptDraft, diffAnswerKeys, markAttemptDraftSaved, mergeDraftIntoServer, readAttemptDraft, writeAttemptDraft } from "@/lib/learning/attempt-draft";
import { describeGenerationFailure, generationFailureCode, type GenerationFailure } from "@/lib/learning/generation-failure";
import { useIsFounder, useStudentShellAccount } from "@/lib/student/student-shell-context";
import { creditGateCopy } from "@/lib/billing/free-reach";
import { STARS_CHANGED_EVENT } from "@/components/parity/stars-dialog";
import type { CoachMessage } from "@/components/parity/exam-node-coach";
import { readPlayLessonV3 } from "@/lib/learning/lesson-play-v3";
import { AUTO_RETRY_CODES, AUTO_RETRY_DELAY_MS, BUSY_CODE, BUSY_MAX_RETRIES, BUSY_RETRY_DELAY_MS, postJsonWithRetry } from "@/lib/learning/generation-retry";
import { topicGainWorthShowing, type TopicGain } from "@/components/parity/topic-gain-card";
import { parsePathChange, type PathChange } from "@/lib/learning/path-change";
import { unscoredResult } from "@/lib/learning/node-result";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { activityTally, tallyScore } from "@/lib/learning/answer-tally";
import { ALL_TOPICS_LABEL, PREP_WIDE_TARGET_KINDS } from "@/lib/learning/prep-wide-target";
import { mergeStreamedQuestions } from "@/lib/learning/quiz-delivery";
import type { ReadinessScreen } from "@/lib/learning/readiness-screen";
import type { WrittenExamReview } from "@/lib/learning/written-exam-review";
import type { OralTopicRow } from "@/components/parity/oral-exam-flow";
import { DEFAULT_ORAL_TEACHER_MOOD, oralVoicePercent, oralVoiceTopicLabel, oralWrittenPercent, reviewItemsFromQuestions, reviewItemsFromTranscript, type OralMessage, type OralTeacherMoodId } from "@/lib/learning/oral-exam-chrome";
import { ORAL_ALL_TOPICS, oralReviewItemFromGrade, oralScoreFraction, type OralExamReport, type OralLength, type OralProbeKind } from "@/lib/learning/oral-exam";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { topicLabelsMatch } from "@/lib/learning/study-tools";
import { normalizeChapters } from "@/lib/learning/podcast-script";
import { DEFAULT_FAMILIARITY, DEFAULT_MOOD, type Familiarity, type Mood } from "@/lib/learning/session-signals";
import type { LevelHint } from "@/lib/learning/prep-level";
import { onGenerationSucceeded } from "@/lib/credits/spendable";
import { difficultyFromFamiliarity, openingStage } from "@/lib/learning/lesson-open";
import { useLearningTimer } from "@/components/learning/use-learning-timer";
import type { LearningSurface } from "@/lib/learning/learning-time";
import { missedCards } from "@/lib/learning/flashcard-round";
import { elapsedMinutes } from "@/lib/learning/activity-duration";
import type { NodeSource } from "@/components/parity/node-sources";
import { DEFAULT_PODCAST_LENGTH, type PodcastLength } from "@/lib/learning/podcast-formats";
import { LESSON_PODCAST_GATE, nodeGateForCode, type NodeGate } from "./gates";

/** Aktif süre hangi başlıkta sayılır: ders, test ya da sınav. */
export function learningSurface(kind: PlanNodeKind): LearningSurface {
  if (kind === "lesson" || kind === "podcast" || kind === "flashcards") return "lesson";
  if (kind === "written_exam" || kind === "oral" || kind === "readiness") return "exam";
  return "quiz";
}

export type Difficulty = "kolay" | "orta" | "ileri";

export type Payload = {
  type?: string;
  title?: string;
  contentMd?: string;
  /** Yapısal ders; yoksa contentMd'ye düşülür (eski kayıtlar). */
  lesson?: unknown;
  // Podcast senaryosu satır bazlı; biçim lib/learning/podcast-script.ts
  // tarafından normalleştiriliyor, eski script biçimi de kabul ediliyor.
  chapters?: unknown[];
  length?: string;
  /** Podcast'in dinleme kontrolü (20 Ekim 2026); yoksa podcast kontrolsüz biter. */
  check?: PublicQuizQuestion[];
  questions?: {
    text?: string;
    prompt?: string;
    options?: string[];
    multi?: boolean;
    correct?: string[];
    explanation?: string;
    optionWhy?: string[];
    steps?: string[];
    misconceptionTag?: string;
    hint?: string;
    expectedPoints?: string[];
    probeKind?: OralProbeKind;
  }[];
  items?: { text: string; correct: boolean; explanation: string; correctedStatement?: string }[];
  cards?: { front: string; back: string }[];
  practice?: string;
  reused?: boolean;
  /** Kilitli araç (Bilgi boşlukları, Tekrar): tamamla düğmesi yok. */
  locked?: boolean;
  /** Senaryo üretiminde düşen kredi. Önbellek 0, yeni senaryo fiyat tablosundaki değer. */
  scriptCredits?: number;
  uncoveredTopics?: string[];
  message?: string;
  screen?: ReadinessScreen;
  /** Parça parça açılan ders: sonraki kavramlar yazılıyor (18 Ekim 2026). */
  building?: boolean;
  /** Söz verilen soru sayısı. Kısa liste bitmiş test sayılmaz. */
  promised?: number;
  /** Yazım söz verilen sayıya varmadan kapandı. */
  generationFailed?: boolean;
  /** Henüz gelmemiş kavramların adları (giriş kartı planı). */
  upcoming?: string[];
  /** Yazarın ekran planı; yazım sürerken sayacın paydası. */
  plannedScreens?: number;
};

/** Yazım sürerken ekranın yeni kavramları sorma aralığı. */
export const LESSON_PROGRESS_POLL_MS = 1_500;
export const NODE_URL = "/api/learning/exam-prep/node";
/** Seçimli cevap (şık, doğru/yanlış, kart): kısa bekleme, arada gelenler tek istekte. */
export const SAVE_DEBOUNCE_MS = 400;
/**
 * Yazılı cevap her tuşta kayıt açmasın: son tuştan bu kadar sonra tek istek. Yazarken yenilenen
 * sayfayı tarayıcı taslağı kurtarır; sunucu kaydı başka cihaz içindir. Rota kişi başına dakikada
 * 16 istekle sınırlı — sık kayıt hız sınırına takılıp asıl cevapları geciktiriyordu.
 */
export const SAVE_TYPING_DEBOUNCE_MS = 4_000;
/** Etkin kayıt bu kadar sürdüyse (askıda ya da yeniden denemede) yeni küme onu bekletmez, iptal eder. */
export const SAVE_SUPERSEDE_AFTER_MS = 3_000;
/** Hız sınırına takılan kayıt: en son küme bu kadar sonra kendiliğinden yeniden gönderilir. */
export const SAVE_RATE_LIMIT_RETRY_MS = 15_000;

/** Bitirme yanıtı gelmeyince (zaman aşımı, ağ, sunucuda sözlü notlandırma) kaydın durumu bu aralıkla sorulur. */
export const RESULT_POLL_MS = 3_000;
/**
 * Yoklama aralığı: ilk beş yoklama 3 sn (sözlü notu çoğunlukla bu sürede biter), sonra 6 sn, iki
 * dakikadan sonra 10 sn. Sabit 3 sn dakikada 20 istek eder; rota kişi başına 16'da keser ve kötüye
 * kullanım kaydı yazar.
 */
export function resultPollDelay(polls: number): number {
  if (polls < 5) return RESULT_POLL_MS;
  if (polls < 20) return 6_000;
  return 10_000;
}
/** Bu kadar süre sonuç gelmezse "uzun sürüyor" satırı ve "Yeniden dene" çıkar; yoklama sürer. */
export const RESULT_LATE_MS = 2 * 60_000;
/**
 * Yoklama "kayıt açık, notlanmıyor" derse bitirme sunucuya ulaşmamıştır (sunucu sahiplenmeyi
 * notlandırmadan önce yazar): son bitirme isteği bittikten bu kadar sonra aynı kimlikle yeniden gider.
 */
export const RECOMPLETE_MIN_GAP_MS = 15_000;

export function jsonPost(body: Record<string, unknown>): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Tarayıcı deposu: gizli pencerede ya da engellenmiş site verisinde erişim fırlatabilir. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Sıradaki kayıt işi: en son cevap kümesi; arada gelenler buna katlanır (coalesce). */
export type SaveJob = {
  answers: Record<string, unknown>;
  cursor: number;
  settlers: { resolve: () => void; reject: (error: unknown) => void }[];
};


/** `ExamNodeSession` özellikleri. */
export type ExamNodeSessionProps = {
  /** Kavram birimli derste dersin kendi adı; kurulum ekranları bunu gösterir. */
  unitTitle?: string | null;
  /** Düğüm daha önce bitirildiyse hazırlık ekranı kendiliğinden yeniden kaydedilmez. */
  nodeDone?: boolean;
  /** Yol kartındaki süre. Kapı ve ders çubuğu aynı sayıyı gösterir. */
  activityMinutes?: number | null;
  prepId: string;
  nodeId: string;
  kind: PlanNodeKind;
  prepTitle: string;
  topicLabel: string | null;
  /** Ders oluşturma merkezinden gelen konu. Üretim bu etiketi kullanır. */
  requestedTopic?: string | null;
  /** Sesli tekrar bu konunun dersinden türetiliyor. */
  topicId?: string | null;
  /** Konuya daha önce girildiyse beyan edilen aşinalık — varsayılan olarak gelir. */
  initialFamiliarity?: Familiarity | null;
  /** Bugün (Türkiye günü) verilmiş ruh hali; varsa kart sorulmaz (19 Ekim 2026). */
  todayMood?: Mood | null;
  /** Sonuç sayfasından "Dersi tekrarla" (?tekrar=1): aynı ders yeniden açılır. */
  replayLesson?: boolean;
  /** Yoldan "Tekrar incele" (?incele=1) ya da bitmiş dersin düz adresi: kayıtlı gövde, kredi yok. */
  reviewSaved?: boolean;
  /** "Farklı anlat" (ders): yeni anlatım açık seçimle bu adreste yazılır (30 Ekim 2026). */
  rewriteHref?: string | null;
  /** Stage 8 — pdf_learning_v2: restore attempt + debounce + save answers. */
  resumeEnabled?: boolean;
  /**
   * Sunucu bu düğümde açık oturum (ya da yazılı denemede inceleme) olabileceğini söylüyor. Değilse
   * "kaldığın yer" sorgusu ve ekranı atlanır: 20 Ekim 2026'da hiç açılmamış derste her açılışta
   * ~5 sn "Kaldığın yer açılıyor… Kaydedilmiş cevapların yükleniyor" yazıyordu.
   */
  openAttempt?: boolean;
  /** Hazırlık bir belgeye bağlıysa dosya adı — üretim ekranında gösterilir. */
  sourceName?: string | null;
  /**
   * Hakkın ne zaman yenileneceği — "12 Eylül 2026 03:00".
   *
   * Hakkı biten öğrenciye yalnızca "yükselt" demek eksik cevap: beklemek de
   * çözüyor ve bunu saklamak doğru olmaz.
   */
  resetsAtLabel?: string | null;
  /** Sözlü deneme konu listesi. Boşsa düğümün kendi konusu tek satır olur. */
  oralTopics?: OralTopicRow[];
  /** Hazırlık dili — ders sonu tekrarı bu dilde kurulur. */
  language?: "tr" | "en";
  /** Hazırlığın dersi ("Matematik"); Aktivitelerim'deki en sevilen dersler. */
  subject?: string | null;
  /** Hazırlığın materyalleri — çalışma ekranında "N kaynak". */
  sources?: NodeSource[];
};

export function useNodeLifecycle(props: ExamNodeSessionProps) {
  const {
  prepId,
  nodeId,
  kind,
  prepTitle,
  topicLabel: initialTopicLabel,
  requestedTopic = null,
  topicId = null,
  initialFamiliarity,
  todayMood = null,
  replayLesson = false,
  reviewSaved = false,
  rewriteHref = null,
  resumeEnabled = false,
  openAttempt = true,
  sourceName = null,
  resetsAtLabel = null,
  oralTopics = [],
  language = "tr",
  subject = null,
  sources = [],
  unitTitle = null,
  nodeDone = false,
  activityMinutes = null,
  } = props;
  const router = useRouter();
  const isAdmin = useIsFounder();
  /**
   * Ekrandaki konu (30 Ekim 2026, Paket I #8): zayıf konuya yönelen hazırlık geneli adımda (zayıf nokta, odaklı
   * pratik, son kartlar) sunucu konuyu açılışta seçer; oturum ve sonuç başlığı onu yazar. Önceden sayfanın
   * okuduğu devralınmış 1. konu kalıyordu: etiket bir konu, sorular başka konu.
   */
  const [topicLabel, setTopicLabel] = useState<string | null>(initialTopicLabel);
  // Kredi kapısının cümlesi: ücretsiz hakkı aşan işte (podcast, sözlü) "doldu" denmez (free-reach.ts).
  const shellAccount = useStudentShellAccount();
  const gateCopy = creditGateCopy(kind, shellAccount?.isPremium ?? false);
  const meta = PLAN_NODE_META[kind];
  // Referans üründeki sıra: aşinalık → ruh hali → kurulum. İkisi de zorunlu değil;
  // "setup"tan geri dönülebilsin diye aynı stage makinesinde tutuluyorlar.
  const isOral = kind === "oral";
  const opensReadiness = kind === "readiness";
  // Aşinalık kurulumda bir kez sorulur (18 Ekim 2026); konunun düzeyi biliniyorsa açılış
  // doğrudan ruh haline geçer. Önceden yazılan içerik bu düzeyle yazıldı.
  // Ruh hali günde bir kez (19 Ekim 2026): bugün verildiyse kart atlanır.
  const signalStage = openingStage(kind, { familiarityKnown: Boolean(initialFamiliarity), moodToday: Boolean(todayMood) });
  const [stage, setStage] = useState<
    | "familiarity"
    | "mood"
    | "recommend"
    | "setup"
    | "play"
    | "result"
    | "restoring"
    /** Bitirme gönderildi, sonuç bekleniyor: sunucu notluyor ya da yanıt ulaşmadı (30 Ekim 2026). */
    | "grading"
    | "oral-topics"
    | "oral-customize"
    | "oral-review-time"
    | "oral-review"
  >(resumeEnabled && openAttempt ? "restoring" : reviewSaved || opensReadiness ? "setup" : isOral ? "oral-topics" : signalStage);
  const [familiarity, setFamiliarity] = useState<Familiarity>(
    initialFamiliarity ?? DEFAULT_FAMILIARITY,
  );
  const [mood, setMood] = useState<Mood>(todayMood ?? DEFAULT_MOOD);
  // Yalnızca çalışırken sayılır; kurulum ve sonuç ekranı değil.
  useLearningTimer(
    learningSurface(kind),
    subject,
    stage === "play" || stage === "oral-review",
  );
  // Aşinalık kurulumdan geldiyse zorluk da ondan başlar; önceden yazılan test bu zorlukla yazıldı.
  const [difficulty, setDifficulty] = useState<Difficulty>(
    initialFamiliarity ? difficultyFromFamiliarity(initialFamiliarity) : "orta",
  );
  const [podcastLength, setPodcastLength] = useState<PodcastLength>(DEFAULT_PODCAST_LENGTH);
  // Ses ücretsiz hesapta açılmaz (VOICE_TURN Plus'ta, 24 Ekim 2026): Soru-cevap yazılı başlar, satır
  // "Plus'ta" der. Hesap bilinmiyorsa (kabuk yok) sunucu karar verir.
  const voiceLocked = Boolean(meta.voice && shellAccount && !shellAccount.isPremium && !shellAccount.isAdmin);
  const [voiceMode, setVoiceMode] = useState(kind === "oral" && meta.voice && !voiceLocked);
  // Seçicide başta düğümün kendi konusu seçili (kimlikle, 30 Ekim 2026); `?konu=` geldiyse o konu.
  const [oralSelected, setOralSelected] = useState<string[]>(() => {
    const hit = requestedTopic
      ? oralTopics.find((topic) => topicLabelsMatch(requestedTopic, topic.label))
      : oralTopics.find((topic) => Boolean(topicId) && topic.id === topicId);
    return hit ? [hit.id] : [];
  });
  const [oralMoodId, setOralMoodId] = useState<OralTeacherMoodId>(DEFAULT_ORAL_TEACHER_MOOD);
  const [oralLength, setOralLength] = useState<OralLength>(3);
  const [oralReport, setOralReport] = useState<OralExamReport | null>(null);
  const [oralPreflight, setOralPreflight] = useState(false);
  const [oralTranscript, setOralTranscript] = useState<OralMessage[]>([]);
  const [oralReviewIndex, setOralReviewIndex] = useState(0);
  const [oralReviewTab, setOralReviewTab] = useState<"ai" | "you">("ai");
  const [loading, setLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  /** Üretim yuvaları dolu: hazırlanıyor ekranında "sıradasın" notu (19 Ekim 2026, Faz 3.2). */
  const [queueNote, setQueueNote] = useState(false);
  /**
   * Hatanın kendisi, yalnızca metni değil.
   *
   * `canRetryNow` hesaplanıyordu ama arayüz onu hiç okumuyordu: hakkı biten
   * öğrenciye de, üretimi süren öğrenciye de çalışmayan bir "Ders oluştur"
   * düğmesi gösteriliyordu.
   */
  const [generationFailure, setGenerationFailure] = useState<GenerationFailure | null>(null);
  const [paywall, setPaywall] = useState(false);
  /** 402'nin kodundan gelen kapı; yoksa etkinliğin varsayılanı (`gateCopy`). */
  const [paywallGate, setPaywallGate] = useState<NodeGate | null>(null);
  const isPremiumAccount = shellAccount?.isPremium ?? false;
  const [payload, setPayload] = useState<Payload>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(1);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [tutorMessages, setTutorMessages] = useState<CoachMessage[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flipped, setFlipped] = useState(false);
  /** Cevabı en az bir kez görülen kartın sırası — değerlendirme ancak ondan sonra açılır. */
  const [revealedCard, setRevealedCard] = useState(-1);
  /** İlk turun sonunda "Hayır" denen kartlar: tekrar turu teklifi. */
  const [cardOffer, setCardOffer] = useState<number[] | null>(null);
  /** Tekrar turu: sıradaki kartlar, konum ve bu turda bilinenler. */
  const [cardRepeat, setCardRepeat] = useState<{ list: number[]; pos: number; known: number[] } | null>(null);
  /** Kart sonucu "Bildiğin kartlar N/M" — kayıttaki puan katılım puanı. */
  const [cardSummary, setCardSummary] = useState<{ known: number; partial: number; total: number; repeated: number } | null>(null);
  const [score, setScore] = useState({ score: 0, total: 1, retried: 0 });
  /** Bu etkinlikle kazanılan yıldız (Astra: sonuç ekranında "+17 yıldız"). */
  const [starsEarned, setStarsEarned] = useState(0);
  const [playStartedAt, setPlayStartedAt] = useState<number | null>(null);
  // Harcanan zaman oturumun başından (P1-7): oynatma başlangıcı yazılmayan yolda (hazır ders, devralınan
  // yazım) fark 0 çıkıp her etkinlik "1 dk" görünüyordu; sayfanın açılışı yedek başlangıçtır.
  const openedAtRef = useRef(Date.now());
  const spentMinutes = () => elapsedMinutes(playStartedAt ?? openedAtRef.current);
  const [oralGrade, setOralGrade] = useState<{
    items: { index: number; correct: boolean; gap: string | null }[];
    scoreRationale?: string;
  } | null>(null);
  const [writtenReview, setWrittenReview] = useState<WrittenExamReview | null>(null);
  const [nextHref, setNextHref] = useState(`/deneme-sinavlari/${prepId}`);
  /** Astra'nın sonuç sonrası düzey önerisi; bitirişte sunucu söyler. */
  const [levelHint, setLevelHint] = useState<LevelHint | null>(null);
  /** Sonuçtan sonra "+%X kazandın" (19 Ekim 2026); yalnız konu hâkimiyeti arttıysa. */
  const [topicGain, setTopicGain] = useState<TopicGain | null>(null);
  /** Sonuca göre yol (20 Ekim 2026): araya giren odaklı pratik ya da kalkan ek testler. */
  const [pathChange, setPathChange] = useState<PathChange | null>(null);
  /** Günü gelen tekrar (20 Ekim 2026): bu etkinlikten yarına yazılan yanlış sayısı. */
  const [reviewScheduled, setReviewScheduled] = useState(0);
  const [gainOpen, setGainOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    headline: string;
    note: string;
    gaps: string[];
    nextFocus: string[];
  } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [tfRevealed, setTfRevealed] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(false);
  /** Podcast bitti, dinleme kontrolü açık (aşama yine "play": süre sayılmaya devam eder). */
  const [podcastCheckOpen, setPodcastCheckOpen] = useState(false);
  const [lessonPodcast, setLessonPodcast] = useState<{
    title: string;
    chapters: unknown[];
  } | null>(null);
  /**
   * Stage 6: cevaplanmadan önce eğitmenden yardım alınan sorular. 20 Ekim 2026'ya kadar her
   * çizimde boş bir nesneydi ve hiç doldurulmuyordu: eğitmenle çözülen soru bağımsız doğru
   * sayılıyordu. Yalnız bellekte; sayfa yenilenirse kaybolur (eski davranış).
   */
  const hintsUsedRef = useRef<Record<string, boolean>>({});
  /** Testte "Kontrol et" ile kilitlenen sorular: sonrasındaki eğitmen açıklaması ipucu değil. */
  const revealedRef = useRef<Set<string>>(new Set());
  const startInFlight = useRef(false);
  const completeInFlight = useRef(false);
  const completeRequestIdRef = useRef<string | null>(null);
  /**
   * Kayıt kuyruğu (30 Ekim 2026): tek etkin istek, en çok bir bekleyen iş. Yeni cevap gelince
   * bekleyen işin cevap kümesi yenisiyle değişir (arada gelenler katlanır); etkin istek askıdaysa
   * iptal edilip en son küme gönderilir. Eski sıralı kuyruk askıdaki isteğin arkasında birikiyordu.
   */
  const saveRef = useRef<{ queued: SaveJob | null; active: AbortController | null; running: boolean; startedAt: number }>({
    queued: null,
    active: null,
    running: false,
    startedAt: 0,
  });
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save429TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Kayıtta gönderilen en ileri soru sırası. */
  const saveCursorRef = useRef(0);
  /** Son onaydan beri yanıtı belirsiz kalan (zaman aşımı, iptal) bir kayıt isteği oldu mu. */
  const saveUncertainRef = useRef(false);
  /** Kayıt kimlikleri senkron okunur: açılışta taslak birleştirmesi state güncellenmeden kaydeder. */
  const attemptIdRef = useRef<string | null>(null);
  const generationIdRef = useRef<string | null>(null);
  /** Sunucunun onayladığı son cevap kümesi; çıkış özeti ve beforeunload bundan sayar. */
  const savedAnswersRef = useRef<Record<string, unknown>>({});
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Sunucuda olmayan cevap sayısı; yalnız bu varken sayfadan çıkış uyarılır. */
  const [unsavedCount, setUnsavedCount] = useState(0);
  /** Açılışta taslaktan geri yüklenen cevap sayısı (bilgi satırı). */
  const [draftRestored, setDraftRestored] = useState(0);
  /** × basıldı ama kaydedilmemiş cevap var: özet ve seçenekler. */
  const [exitPrompt, setExitPrompt] = useState(false);
  /** Sonuç bekleme: ne zamandan beri; geç kaldıysa "Yeniden dene" çıkar. */
  const [gradingSince, setGradingSince] = useState<number | null>(null);
  const [gradingLate, setGradingLate] = useState(false);
  /** Arka plan yoklaması (sonucu anında gösterilen test/doğru-yanlışta ekran değişmez). */
  const [resultPolling, setResultPolling] = useState<{ moveStage: boolean } | null>(null);
  const lastCompleteSettledRef = useRef(0);
  const contentVersionRef = useRef(1);
  const answersRef = useRef<Record<string, unknown>>({});

  const isTimedExam = kind === "written_exam";
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  // Sayfadan çıkış uyarısı yalnız gerçekten kaydedilmemiş cevap varken (30 Ekim 2026): kayıt süren
  // ya da düşen cevaplar. Sonuç beklenirken cevaplar sunucuda, uyarı yok.
  useEffect(() => {
    if (!(pendingSaves > 0 || unsavedCount > 0) || stage === "grading" || stage === "result") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingSaves, unsavedCount, stage]);

  useEffect(() => {
    contentVersionRef.current = contentVersion;
  }, [contentVersion]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Yeni deneme, yeni ipucu kaydı.
  useEffect(() => {
    hintsUsedRef.current = {};
    revealedRef.current = new Set();
  }, [attemptId]);

  // Açılış düğüm başına BİR KEZ (30 Ekim 2026, canlı tur): ders bitince ya da kredi düşünce `router.refresh()` sunucu
  // özelliklerini yeniler; `openAttempt` (açık oturum var mı) ve bitmiş dersin düz adresinde `reviewSaved` değişince
  // bu etki yeniden koşuyor, "Tekrar incele" sonunda ders sonuç ekranı yerine 1. adımdan yeniden açılıyordu. Yarıda
  // kesilen açılış (bağımlılık açılış sürerken değişti) yeniden koşabilir; tamamlanan açılış bir daha koşmaz.
  const openedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resumeEnabled) return;
    const openKey = `${prepId}:${nodeId}`;
    if (openedForRef.current === openKey) return;
    openedForRef.current = openKey;
    let cancelled = false;
    let settled = false;
    void (async () => {
        if (!openAttempt) {
        // Açık oturum yok: doğrudan açılış (tekrar isteği de burada başlar).
        if (reviewSaved || (kind === "lesson" && replayLesson)) {
          setStage("setup");
          void start(reviewSaved ? { review: true } : { replay: true });
        }
        return;
      }
      try {
        const res = await fetch("/api/learning/exam-prep/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, nodeId, action: "resume", lessonFormat: 3 }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.resumed && data.attemptId && data.payload) {
          applyStartPayload(data);
          setPlayStartedAt(Date.now());
          setStage("play");
          return;
        }
        // Bitirme gönderilmiş, sunucu hâlâ notluyor (sözlü): sorulara dönülmez, sonuç beklenir.
        // Eskiden açık kayıt "kaldığı yer" diye son sorudan açılıyor, ikinci bir bitirme gidiyordu.
        if (res.ok && data.grading === true && typeof data.attemptId === "string") {
          attemptIdRef.current = data.attemptId;
          setAttemptId(data.attemptId);
          enterGradingWait(true);
          return;
        }
        if (kind === "written_exam") {
          const reviewRes = await fetch("/api/learning/exam-prep/node", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prepId, nodeId, action: "review", lessonFormat: 3 }),
          });
          const reviewData = await reviewRes.json().catch(() => ({}));
          if (!cancelled && reviewRes.ok && reviewData.review) {
            setWrittenReview(reviewData.review);
            setScore({
              score: reviewData.score ?? reviewData.review.score ?? 0,
              total: reviewData.total ?? reviewData.review.total ?? 1,
              retried: reviewData.retried ?? 0,
            });
            setStage("result");
            return;
          }
        }
      } catch {
        // Fall through to normal setup.
      }
      if (!cancelled) {
        if (reviewSaved) {
          setStage("setup");
          void start({ review: true });
        } else if (kind === "lesson" && replayLesson) {
          // Sonuç sayfasından "Dersi tekrarla": soru kartları olmadan aynı ders.
          setStage("setup");
          void start({ replay: true });
        } else {
          setStage(kind === "oral" ? "oral-topics" : kind === "readiness" ? "setup" : signalStage);
        }
      }
    })().finally(() => {
      settled = true;
    });
    return () => {
      cancelled = true;
      if (!settled) openedForRef.current = null;
    };
    // start her render'da yeni; yalnız açılışta, kayıtlı oturum yoksa bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeEnabled, openAttempt, prepId, nodeId, kind, signalStage, replayLesson, reviewSaved]);

  // Özellik kapalıyken de kayıtlı içerik açılsın; kurulum kartı üretim başlatmasın. Yine düğüm başına bir kez: ders
  // bitince bitmiş dersin düz adresi `reviewSaved` olur, sonuç ekranı kayıtlı derse dönmesin.
  useEffect(() => {
    if (resumeEnabled) return;
    const openKey = `${prepId}:${nodeId}`;
    if (openedForRef.current === openKey) return;
    openedForRef.current = openKey;
    if (!reviewSaved) return;
    setStage("setup");
    void start({ review: true });
    // start her render'da yeni; yalnız açılışta bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewSaved, resumeEnabled]);

  // Isınma (19 Ekim 2026): ders düğümü açılıp ruh hali / aşinalık ekranı görününce yazım sunucuda
  // hemen başlar; öğrenci kartlara bakarken ilk kavram hazırlanır, "Ders oluştur" devralır.
  // Bir kez; "Dersi tekrarla" hariç (o yazdırmaz). Sunucu süren kayıt ya da hazır ders varsa atlar.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (kind !== "lesson" || replayLesson || reviewSaved || warmedRef.current) return;
    // Ruh hali bugün verildiyse açılış doğrudan kurulum kartıdır (30 Ekim 2026: öneri kartı kalktı); ısınma orada da
    // başlar. Kurulum kartı ders dışında da var: ısınma yalnız ders düğümünde (yukarıdaki kind koşulu).
    if (stage !== "familiarity" && stage !== "mood" && stage !== "recommend" && stage !== "setup") return;
    warmedRef.current = true;
    void fetch("/api/learning/exam-prep/node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepId, nodeId, action: "warm", familiarity, lessonFormat: 3 }),
    }).catch(() => undefined);
  }, [kind, replayLesson, reviewSaved, stage, prepId, nodeId, familiarity]);

  useEffect(() => {
    if (kind !== "readiness" || stage !== "setup" || startInFlight.current) return;
    void start();
    // start her render'da yeni; yalnız hazırlık ekranı kuruluma düşünce bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, stage]);

  // Hazırlık ekranı görüntülenince adım tamamlanır: yol %100'e ulaşabilsin (düğme beklenmez).
  const readinessAutoDone = useRef(false);
  useEffect(() => {
    if (kind !== "readiness" || nodeDone || readinessAutoDone.current) return;
    if (stage !== "play" || payload.type !== "readiness" || !payload.screen || loading) return;
    readinessAutoDone.current = true;
    void finish();
    // finish her render'da yeni; ekran ilk kez göründüğünde bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, nodeDone, stage, payload, loading]);

  // Sonuç yoklaması (30 Ekim 2026, Paket I): bitirmenin yanıtı gelmediyse ya da sunucu sözlüyü arka
  // planda notluyorsa kayıt 3 sn'de bir sorulur (sonra seyrelir, `resultPollDelay`). Açık kalmış ve
  // notlanmayan kayıt, bitirmenin sunucuya hiç ulaşmadığını söyler: bitirme aynı kimlikle yeniden
  // gönderilir (sunucu çift notlamaz).
  const pollMode = stage === "grading" ? "screen" : resultPolling ? "background" : null;
  useEffect(() => {
    if (!pollMode || !attemptId) return;
    const moveStage = pollMode === "screen";
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    const poll = async () => {
      polls += 1;
      try {
        const res = await fetchWithRetry(
          NODE_URL,
          jsonPost({ prepId, nodeId, action: "resume", attemptId, lessonFormat: 3 }),
          { timeoutMs: SAVE_TIMEOUT_MS, retryDelaysMs: [] },
        );
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (stopped) return;
        if (res.ok && data.completed === true) {
          applyComplete(data, moveStage);
          router.refresh();
          return;
        }
        if (res.ok && data.found === false) {
          // Kayıt yok (başka sekmede silinmiş ya da yenilenmiş): beklemek bir şey değiştirmez.
          if (moveStage) setGradingLate(true);
          else setResultPolling(null);
          return;
        }
        const resend =
          res.ok &&
          data.active === true &&
          data.grading !== true &&
          !completeInFlight.current &&
          Date.now() - lastCompleteSettledRef.current >= RECOMPLETE_MIN_GAP_MS;
        if (resend) {
          completeInFlight.current = true;
          let posted: Awaited<ReturnType<typeof postCompleteOutcome>>;
          try {
            posted = await postCompleteOutcome(answersRef.current);
          } finally {
            completeInFlight.current = false;
          }
          if (stopped) return;
          if (posted.kind === "done") {
            applyComplete(posted.data, moveStage);
            router.refresh();
            return;
          }
          if (posted.kind === "error") {
            if (moveStage) {
              toast.error(typeof posted.data.error === "string" ? posted.data.error : "Kaydedilemedi.");
              setGradingLate(true);
            } else {
              setResultPolling(null);
            }
            return;
          }
        }
      } catch {
        // Yoklama düştü: bir sonraki turda yeniden sorulur.
      }
      if (!stopped) timer = setTimeout(poll, resultPollDelay(polls));
    };
    timer = setTimeout(poll, resultPollDelay(polls));
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // applyComplete ve postCompleteOutcome her çizimde yeni; yalnız ref ve sabit kimlikler okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMode, attemptId, prepId, nodeId]);

  // Bekleme uzadıysa "uzun sürüyor" satırı ve "Yeniden dene" (yoklama sürer).
  useEffect(() => {
    if (gradingSince === null || gradingLate) return;
    const timer = setTimeout(() => setGradingLate(true), Math.max(0, RESULT_LATE_MS - (Date.now() - gradingSince)));
    return () => clearTimeout(timer);
  }, [gradingSince, gradingLate]);

  // Sayfadan çıkarken bekleyen kayıt hemen gider; gitmezse taslak bir sonraki açılışta yüklenir.
  useEffect(
    () => () => {
      if (save429TimerRef.current) clearTimeout(save429TimerRef.current);
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
        void persistAnswers(answersRef.current, saveCursorRef.current).catch(() => undefined);
      }
    },
    // Yalnız ayrılırken; kayıt kimlikleri ref'ten okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (stage !== "play" || !isTimedExam) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, isTimedExam]);

  useEffect(() => {
    if (stage !== "play" || !isTimedExam || timeLeft > 0) return;
    toast.message("Süre doldu — cevapların gönderiliyor.");
    void finish();
    // finish her render'da yeni; yalnızca süre 0'a inince bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, stage, isTimedExam]);

  function storageKey() {
    return `exam-node-req:${prepId}:${nodeId}`;
  }

  function getOrCreateClientRequestId() {
    if (typeof window === "undefined") return crypto.randomUUID();
    const existing = sessionStorage.getItem(storageKey());
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(storageKey(), id);
    return id;
  }

  function clearClientRequestId() {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(storageKey());
  }

  function applyStartPayload(data: {
    attemptId?: string;
    generationId?: string;
    clientRequestId?: string;
    contentVersion?: number;
    payload?: Payload;
    answers?: Record<string, unknown>;
    cursorIndex?: number;
    voiceMode?: boolean;
    expiresAt?: string | null;
    timeLeftSec?: number;
    /** Sunucu kaydının son yazımı; tarayıcı taslağı bundan yeniyse taslak üstün. */
    updatedAt?: string | null;
    /** Sunucunun bu oturum için seçtiği konu. */
    topicLabel?: string | null;
  }) {
    setPayload(data.payload ?? {});
    // Sorulan konu: içeriğin taşıdığı ad (`testedTopic`), yoksa sunucunun döndürdüğü etiket. Yalnız konuya
    // yönelen hazırlık geneli adımda; konuya bağlı adım kendi konusunu zaten gösteriyor.
    if (PREP_WIDE_TARGET_KINDS.has(kind) && !requestedTopic) {
      const tested = (data.payload as { testedTopic?: unknown } | undefined)?.testedTopic;
      const chosen = typeof tested === "string" && tested.trim() ? tested.trim() : data.topicLabel?.trim();
      if (chosen) setTopicLabel(chosen);
    }
    setAttemptId(data.attemptId ?? null);
    attemptIdRef.current = data.attemptId ?? null;
    setGenerationId(data.generationId ?? null);
    generationIdRef.current = data.generationId ?? null;
    if (data.clientRequestId) setClientRequestId(data.clientRequestId);
    const ver = data.contentVersion ?? 1;
    setContentVersion(ver);
    contentVersionRef.current = ver;
    const serverAnswers =
      data.answers && typeof data.answers === "object" ? (data.answers as Record<string, unknown>) : {};
    savedAnswersRef.current = serverAnswers;
    let nextAnswers = serverAnswers;
    let nextCursor = typeof data.cursorIndex === "number" ? data.cursorIndex : 0;
    // Tarayıcı taslağı (30 Ekim 2026): kayıt isteği askıda kalıp sayfa yenilendiyse cevaplar burada.
    // Sunucu kaydı taslaktan eskiyse taslağın anahtarları üstün gelir ve hemen kaydedilir.
    if (resumeEnabled && data.attemptId) {
      const merged = mergeDraftIntoServer(
        { answers: serverAnswers, cursor: nextCursor, updatedAt: data.updatedAt ?? null },
        readAttemptDraft(browserStorage(), data.attemptId),
      );
      if (merged.restored.length) {
        nextAnswers = merged.answers;
        nextCursor = merged.cursor;
        setDraftRestored(merged.restored.filter((key) => /^\d+$/.test(key)).length || merged.restored.length);
      }
    }
    saveCursorRef.current = nextCursor;
    saveUncertainRef.current = false;
    if (data.answers && typeof data.answers === "object") {
      setAnswers(nextAnswers);
      answersRef.current = nextAnswers;
    } else if (nextAnswers !== serverAnswers) {
      setAnswers(nextAnswers);
      answersRef.current = nextAnswers;
    }
    refreshUnsaved(nextAnswers);
    if (typeof data.cursorIndex === "number" || nextAnswers !== serverAnswers) {
      setIndex((current) => Math.max(current, nextCursor));
    }
    if (nextAnswers !== serverAnswers) {
      void persistAnswers(nextAnswers, nextCursor).catch(() => undefined);
    }
    if (typeof data.voiceMode === "boolean") setVoiceMode(data.voiceMode);
    if (typeof data.timeLeftSec === "number") {
      setTimeLeft(data.timeLeftSec);
    } else if (data.expiresAt) {
      const end = new Date(data.expiresAt).getTime();
      if (!Number.isNaN(end)) {
        setTimeLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
      }
    }
  }

  /** Sunucuya kaydedilecek bir kayıt var mı (özellik kapalıyken ya da kimliksiz kayıtta hiçbir şey gitmez). */
  function savesEnabled() {
    return Boolean(resumeEnabled && attemptIdRef.current && generationIdRef.current);
  }

  /** Sunucuda olmayan cevapların sayısı: çıkış uyarısı ve özet buna bakar. */
  function refreshUnsaved(current: Record<string, unknown> = answersRef.current) {
    setUnsavedCount(savesEnabled() ? diffAnswerKeys(current, savedAnswersRef.current).length : 0);
  }

  function syncPendingSaves() {
    const state = saveRef.current;
    setPendingSaves((state.running ? 1 : 0) + (state.queued ? 1 : 0));
  }

  function cancelSaveDebounce() {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = null;
  }

  /**
   * Cevap değişti: taslak hemen tarayıcıya yazılır, sunucu kaydı kısa bir beklemeden sonra gider
   * (yazılı cevap her tuşta istek açmasın; rota dakikada 16 istekle sınırlı).
   */
  function scheduleSave(nextAnswers: Record<string, unknown>, cursor: number, delayMs = SAVE_DEBOUNCE_MS) {
    if (!savesEnabled()) return;
    saveCursorRef.current = Math.max(saveCursorRef.current, cursor);
    writeAttemptDraft(browserStorage(), attemptIdRef.current as string, { answers: nextAnswers, cursor: saveCursorRef.current });
    refreshUnsaved(nextAnswers);
    cancelSaveDebounce();
    saveDebounceRef.current = setTimeout(() => {
      saveDebounceRef.current = null;
      void persistAnswers(answersRef.current, saveCursorRef.current).catch(() => undefined);
    }, delayMs);
  }

  /**
   * Kaydı kuyruğa koyar. Bekleyen iş varsa cevap kümesi en yenisiyle değişir (arada gelenler
   * katlanır); etkin istek uzun süredir askıdaysa iptal edilir ve en son küme gönderilir. Her
   * terminal sonuçta (başarı, 4xx, üç denemeden sonra düşüş) bekleyen sayısı düşer.
   */
  function persistAnswers(nextAnswers: Record<string, unknown>, cursor: number): Promise<void> {
    if (!savesEnabled()) return Promise.resolve();
    cancelSaveDebounce();
    if (save429TimerRef.current) clearTimeout(save429TimerRef.current);
    save429TimerRef.current = null;
    return new Promise<void>((resolve, reject) => {
      const state = saveRef.current;
      if (state.queued) {
        state.queued.answers = nextAnswers;
        state.queued.cursor = Math.max(state.queued.cursor, cursor);
        state.queued.settlers.push({ resolve, reject });
      } else {
        state.queued = { answers: nextAnswers, cursor, settlers: [{ resolve, reject }] };
      }
      if (state.running && state.active && Date.now() - state.startedAt > SAVE_SUPERSEDE_AFTER_MS) {
        state.active.abort();
      }
      syncPendingSaves();
      void pumpSaves();
    });
  }

  async function pumpSaves() {
    const state = saveRef.current;
    if (state.running || !state.queued) return;
    const job = state.queued;
    state.queued = null;
    const controller = new AbortController();
    state.active = controller;
    state.running = true;
    state.startedAt = Date.now();
    syncPendingSaves();
    try {
      await sendSave(job, controller.signal);
      job.settlers.forEach((settler) => settler.resolve());
      if (!saveRef.current.queued) {
        setSaveError(null);
        refreshUnsaved();
      }
    } catch (error) {
      if (controller.signal.aborted && saveRef.current.queued) {
        // Yenisiyle değiştirildi: bu işi bekleyenler en son kümenin sonucunu alır.
        saveRef.current.queued.settlers.push(...job.settlers);
      } else if (controller.signal.aborted) {
        job.settlers.forEach((settler) => settler.resolve());
      } else {
        const code = (error as { code?: unknown } | null)?.code;
        refreshUnsaved();
        if (code === "http_429") {
          // Hız sınırı sınavın ortasında kırmızı uyarı açmaz: cevaplar tarayıcı taslağında, en son
          // küme bir süre sonra kendiliğinden yeniden gönderilir (çıkış uyarısı yine korur).
          save429TimerRef.current = setTimeout(() => {
            save429TimerRef.current = null;
            void persistAnswers(answersRef.current, saveCursorRef.current).catch(() => undefined);
          }, SAVE_RATE_LIMIT_RETRY_MS);
        } else {
          setSaveError(error instanceof Error ? error.message : "Cevapların kaydedilemedi.");
        }
        job.settlers.forEach((settler) => settler.reject(error));
      }
    } finally {
      state.active = null;
      state.running = false;
      syncPendingSaves();
      if (state.queued) void pumpSaves();
    }
  }

  function saveFailureMessage(code: string | null, status: number) {
    if (code === "stale_version" || code === "stale_generation") {
      return "Bu ders başka bir sekmede değişti. Devam etmeden sayfayı yenile.";
    }
    if (status === 429) return "Kayıt şu an yoğun. Cevapların bu cihazda saklı, birazdan yeniden gönderilir.";
    return "Cevapların kaydedilemedi. Cevapların bu cihazda saklı; bağlantını kontrol edip kaydı yeniden dene.";
  }

  /** Sunucudaki güncel sürüm (yoklama). "closed": kayıt bitmiş ya da notlanıyor. */
  async function readAttemptVersion(signal: AbortSignal): Promise<number | "closed" | null> {
    try {
      const res = await fetchWithRetry(
        NODE_URL,
        jsonPost({ prepId, nodeId, action: "resume", attemptId: attemptIdRef.current, lessonFormat: 3 }),
        { timeoutMs: SAVE_TIMEOUT_MS, retryDelaysMs: [], signal },
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) return null;
      if (data.completed === true || data.grading === true) return "closed";
      if (data.active !== true || data.generationId !== generationIdRef.current) return null;
      return typeof data.contentVersion === "number" ? data.contentVersion : null;
    } catch {
      return null;
    }
  }

  async function sendSave(job: SaveJob, signal: AbortSignal): Promise<void> {
    const attempt = attemptIdRef.current;
    const generation = generationIdRef.current;
    if (!attempt || !generation) return;
    for (let round = 0; ; round += 1) {
      let retried = false;
      let res: Response;
      try {
        res = await fetchWithRetry(
          NODE_URL,
          jsonPost({
            prepId,
            nodeId,
            action: "save",
            attemptId: attempt,
            generationId: generation,
            contentVersion: contentVersionRef.current,
            answers: job.answers,
            cursorIndex: job.cursor,
          }),
          {
            timeoutMs: SAVE_TIMEOUT_MS,
            retryDelaysMs: SAVE_RETRY_DELAYS_MS,
            signal,
            onRetry: () => {
              retried = true;
            },
          },
        );
      } catch (error) {
        // Zaman aşımı ya da iptal: istek sunucuya ulaşmış olabilir; sürüm belirsiz.
        saveUncertainRef.current = true;
        throw Object.assign(
          new Error(saveFailureMessage(null, 0)),
          { code: isTransportFailure(error) ? "transport" : "superseded" },
        );
      }
      if (retried) saveUncertainRef.current = true;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && typeof data.contentVersion === "number") {
        contentVersionRef.current = data.contentVersion;
        setContentVersion(data.contentVersion);
        saveUncertainRef.current = false;
        savedAnswersRef.current = job.answers;
        markAttemptDraftSaved(browserStorage(), attempt, job.answers);
        return;
      }
      // Hız sınırının gövdesi kod değil cümle taşır; durumdan okunur.
      const code = res.status === 429 ? "http_429" : typeof data.error === "string" ? data.error : null;
      // Kayıt kapandı (bitirme aldı ya da notlanıyor): cevaplar bitirmeyle gitti, hata değil.
      if (code === "attempt_not_active") return;
      // Düşen kendi isteğimiz sunucuya ulaşmışsa sürüm ilerlemiştir: güncel sürümle bir kez daha.
      // Belirsiz istek yokken gelen sürüm hatası gerçekten başka sekmedir.
      if (code === "stale_version" && round === 0 && saveUncertainRef.current) {
        const fresh = await readAttemptVersion(signal);
        if (fresh === "closed") return;
        if (typeof fresh === "number") {
          contentVersionRef.current = fresh;
          setContentVersion(fresh);
          continue;
        }
      }
      throw Object.assign(new Error(saveFailureMessage(code, res.status)), { code: code ?? `http_${res.status}` });
    }
  }

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function start(overrides?: {
    difficulty?: Difficulty;
    voiceMode?: boolean;
    mood?: Mood;
    /** "Dersi tekrarla": son ders yeniden açılır, yeniden yazılmaz. */
    replay?: boolean;
    /** Kayıtlı gövdeyi kredi düşmeden aç. */
    review?: boolean;
    /** Sunucu düşünce ekranın kendi kendine yaptığı ikinci deneme (bir kez). */
    autoRetried?: boolean;
    /** Üretim yuvaları doluyken ("sıradasın") yapılan bekleme denemelerinin sayısı. */
    busyTries?: number;
  }) {
    if (startInFlight.current || loading) return;
    startInFlight.current = true;
    setGenerationFailure(null);
    setLoading(true);
    setGenerationError(null);
    try {
      const reqId = resumeEnabled ? getOrCreateClientRequestId() : undefined;
      if (reqId) setClientRequestId(reqId);
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          action: "start",
          // Bu ekran LessonV3 (ekran → blok) okuyor; eski sekme göndermez, V2 alır.
          lessonFormat: 3,
          // Ders parça parça açılır: ilk denetlenmiş kavram gelince ekran açılır (18 Ekim 2026).
          ...(kind === "lesson" && !overrides?.review ? { lessonStream: true } : {}),
          ...(kind === "lesson" && overrides?.replay ? { replay: true } : {}),
          ...(overrides?.review ? { review: true } : {}),
          difficulty: overrides?.difficulty ?? difficulty,
          voiceMode: overrides?.voiceMode ?? voiceMode,
          familiarity,
          mood: overrides?.mood ?? mood,
          ...(isOral
            ? {
                oralQuestionCount: oralLength,
                oralScope: oralSelected.includes(ORAL_ALL_TOPICS) ? "all" : "topic",
                oralTopicLabel: (oralSelected.includes(ORAL_ALL_TOPICS)
                  ? (oralTopics.length ? oralTopics : [{ label: topicLabel || prepTitle }])
                      .map((topic) => topic.label)
                      .join(", ")
                  : oralTopics
                      .filter((topic) => oralSelected.includes(topic.id))
                      .map((topic) => topic.label)
                      .join(", ") || topicLabel || prepTitle
                ).slice(0, 400),
                // Seçilen konular kimlikle (30 Ekim 2026): sunucu üretimi, sonuç başlığını ve kaydı aynı konuya bağlar.
                oralTopicIds: oralSelected.includes(ORAL_ALL_TOPICS)
                  ? []
                  : oralTopics.filter((topic) => oralSelected.includes(topic.id)).map((topic) => topic.id),
              }
            : {}),
          ...(requestedTopic && !isOral ? { activityTopicLabel: requestedTopic.slice(0, 400) } : {}),
          ...(kind === "podcast" ? { podcastLength } : {}),
          ...(reqId ? { clientRequestId: reqId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setPaywallGate(nodeGateForCode(data.code, gateCopy, isPremiumAccount));
        setPaywall(true);
        return;
      }
      if (!res.ok) {
        // Kimlik HER gerçek hatada yenileniyor. Eskiden yalnızca
        // "generation_failed_retry" kodunda yenileniyordu; gerçek bir
        // hatadan (503) sonra ilk iki tıklama hiçbir şey yapmıyor,
        // üçüncüsü deniyordu. Öğrenci için bu "düğme bozuk" demekti.
        //
        // Üretim hâlâ sürüyorsa yenilenmiyor: yenilemek ikinci bir üretim
        // başlatır ve öğrenci iki kez ödeyebilir.
        const code = generationFailureCode(data);
        // Yuvalar dolu (Faz 3.2): hata değil, sıra. Hazırlanıyor ekranı açık kalır, birkaç saniyede bir
        // yeniden sorulur; sunucu her denemede yer açılmasını ayrıca bekliyor.
        if (code === BUSY_CODE && (overrides?.busyTries ?? 0) < BUSY_MAX_RETRIES) {
          setQueueNote(true);
          await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
          startInFlight.current = false;
          await start({ ...overrides, busyTries: (overrides?.busyTries ?? 0) + 1 });
          return;
        }
        setQueueNote(false);
        // 19 Ekim 2026 (ürün sahibi: "oluşturulamadı gibi uyarılar olmasın"): üretim düşünce
        // ekran bir kez kendiliğinden yeniden dener; hazırlanıyor ekranı kapanmaz. Hak, paket
        // ve kaynak hataları yeniden denemekle geçmez, onlar hemen söylenir.
        if (typeof code === "string" && AUTO_RETRY_CODES.has(code) && !overrides?.autoRetried) {
          clearClientRequestId();
          await new Promise((resolve) => setTimeout(resolve, AUTO_RETRY_DELAY_MS));
          startInFlight.current = false;
          await start({ ...overrides, autoRetried: true });
          return;
        }
        const failure = describeGenerationFailure(
          code,
          resetsAtLabel ?? undefined,
          kind,
          {
            isAdmin,
            refunded: data.refunded === true,
            reason: typeof data.reason === "string" ? data.reason : undefined,
          },
        );
        if (failure.retryMintsNewId) clearClientRequestId();
        setGenerationFailure(failure);
        setGenerationError(failure.message);
        return;
      }
      setQueueNote(false);
      applyStartPayload(data);
      if (typeof data.balance === "number") {
        window.dispatchEvent(new CustomEvent("cortex-balance", { detail: data.balance }));
      }
      setPlayStartedAt(Date.now());
      setStage("play");
      onGenerationSucceeded(() => router.refresh());
    } catch {
      // Bağlantı ders yazılırken koptuysa sunucu çoğu zaman yazmayı bitiriyor
      // (16 Ekim 2026: hata çıktı, sayfa yenilenince ders oradaydı). Önce bir kez bak.
      if (resumeEnabled && (await resumeAfterLostStart())) return;
      setGenerationError("Hazırlanıyor. Yeniden dene.");
    } finally {
      setLoading(false);
      startInFlight.current = false;
    }
  }

  async function resumeAfterLostStart(): Promise<boolean> {
    try {
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId, action: "resume", lessonFormat: 3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.resumed || !data.attemptId || !data.payload) return false;
      applyStartPayload(data);
      setPlayStartedAt(Date.now());
      setStage("play");
      return true;
    } catch {
      return false;
    }
  }

  /** Sunucunun notuyla aynı sayım (`answer-tally.ts`, 30 Ekim 2026): ekrandaki işaretler ve x/y ayrışmaz. */
  function localOptimisticScore(base: Record<string, unknown>): { score: number; total: number } | null {
    if (payload.building) return null;
    if (payload.type === "quiz") {
      const questions = payload.questions ?? [];
      if (!questions.length || questions.some((question) => !question.correct?.length)) return null;
      return tallyScore(activityTally(payload, base));
    }
    if (payload.type === "true_false") {
      const items = payload.items ?? [];
      if (!items.length) return null;
      return tallyScore(activityTally(payload, base));
    }
    return null;
  }

  function applyComplete(data: Record<string, unknown>, moveStage: boolean) {
    clearClientRequestId();
    setSaveError(null);
    completeRequestIdRef.current = null;
    // Kayıt bitti: cevaplar sunucuda, taslak ve bekleyen kayıtlar gereksiz (30 Ekim 2026).
    cancelSaveDebounce();
    if (attemptIdRef.current) clearAttemptDraft(browserStorage(), attemptIdRef.current);
    savedAnswersRef.current = answersRef.current;
    setUnsavedCount(0);
    setExitPrompt(false);
    setGradingSince(null);
    setGradingLate(false);
    setResultPolling(null);
    setScore({
      score: Number(data.score) || 0,
      total: Number(data.total) || 1,
      retried: Number(data.retried) || 0,
    });
    const earned = Number(data.stars) || 0;
    setStarsEarned(earned);
    if (earned > 0) window.dispatchEvent(new Event(STARS_CHANGED_EVENT));
    const graded = data.oralGrade as { items?: { index: number; correct: boolean; gap: string | null }[]; scoreRationale?: string } | null;
    setOralGrade(graded && Array.isArray(graded.items) ? { items: graded.items, scoreRationale: graded.scoreRationale } : null);
    if (data.review) setWrittenReview(data.review as WrittenExamReview);
    if (data.oralReview) setOralReport(data.oralReview as OralExamReport);
    setNextHref(typeof data.nextHref === "string" ? data.nextHref : `/deneme-sinavlari/${prepId}`);
    setLevelHint(data.levelHint === "too_hard" || data.levelHint === "too_easy" ? data.levelHint : null);
    setTopicGain(topicGainWorthShowing(data.topicGain) ? data.topicGain : null);
    setPathChange(parsePathChange(data.pathChange));
    setReviewScheduled(Number(data.reviewScheduled) || 0);
    setGainOpen(false);
    setFeedback(null);
    if (moveStage) setStage(kind === "oral" ? "oral-review-time" : "result");
    if (typeof data.balance === "number") {
      window.dispatchEvent(new CustomEvent("cortex-balance", { detail: data.balance }));
    }
  }

  /**
   * Bitirme isteği: 60 sn tavan, yeniden deneme yok (ikinci gönderim yoklamadan, aynı kimlikle).
   * Bitirme bütün cevapları taşır ve sunucu kayıtlılarla birleştirir: önce kayıt beklenmez —
   * askıdaki bir kayıt bitirmeyi bekletmesin (30 Ekim 2026; eskiden kayıt düşerse bitirme hiç gitmiyordu).
   */
  async function postComplete(base: Record<string, unknown>) {
    cancelSaveDebounce();
    if (!completeRequestIdRef.current) {
      completeRequestIdRef.current = crypto.randomUUID();
    }
    try {
      const res = await fetchWithRetry(
        NODE_URL,
        jsonPost({
          prepId,
          nodeId,
          action: "complete",
          lessonFormat: 3,
          attemptId: attemptIdRef.current ?? attemptId ?? undefined,
          generationId: generationIdRef.current ?? generationId ?? undefined,
          clientRequestId: clientRequestId ?? undefined,
          completeRequestId: resumeEnabled
            ? completeRequestIdRef.current
            : undefined,
          // Sonuç yoklanabiliyor: sözlü notu yanıttan sonra, ekran "Değerlendiriliyor…" der.
          ...(resumeEnabled ? { gradingAsync: true } : {}),
          answers: {
            ...base,
            __meta: { hintsUsed: hintsUsedRef.current },
          },
        }),
        { timeoutMs: COMPLETE_TIMEOUT_MS, retryDelaysMs: [] },
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    } finally {
      lastCompleteSettledRef.current = Date.now();
    }
  }

  /** Bitirmenin sonucu: bitti, sunucu notluyor, yanıt ulaşmadı ya da kesin hata. */
  async function postCompleteOutcome(
    base: Record<string, unknown>,
  ): Promise<{ kind: "done"; data: Record<string, unknown> } | { kind: "grading" } | { kind: "lost" } | { kind: "error"; data: Record<string, unknown> }> {
    try {
      const posted = await postComplete(base);
      if (posted.ok && posted.data.grading === true) return { kind: "grading" };
      if (posted.ok) return { kind: "done", data: posted.data };
      // 5xx: sunucu düştü; kayıt yoklanır, açık kalmışsa bitirme yeniden gönderilir.
      if (posted.status >= 500) return { kind: "lost" };
      return { kind: "error", data: posted.data };
    } catch (error) {
      return isTransportFailure(error) ? { kind: "lost" } : { kind: "error", data: {} };
    }
  }

  /**
   * Sonuç bekleme (30 Ekim 2026): bitirme zaman aşımına düştü, ağ koptu ya da sunucu sözlüyü arka
   * planda notluyor. Ekran "Değerlendiriliyor…" der ve kaydı 3 sn'de bir yoklar.
   */
  function enterGradingWait(moveStage: boolean) {
    if (!resumeEnabled) {
      // Yoklama ucu kapalı (özellik bayrağı): eski davranış, öğrenci yeniden dener.
      toast.error("Bağlantı hatası. Yeniden dene.");
      return;
    }
    setGradingSince((current) => current ?? Date.now());
    setGradingLate(false);
    setExitPrompt(false);
    if (moveStage) setStage("grading");
    else setResultPolling({ moveStage: false });
  }

  async function finish(nextAnswers?: Record<string, unknown>) {
    // Bitirme sürerken "Sınavı bitir": bekleme ekranına geçilir, süren istek sonucu getirir.
    if (completeInFlight.current) {
      if (stage === "play") enterGradingWait(true);
      return;
    }
    if (loading || stage === "grading") return;
    const base = nextAnswers ?? answersRef.current;
    const local =
      payload.type === "quiz" || payload.type === "true_false" ? localOptimisticScore(base) : null;
    if (local) {
      completeInFlight.current = true;
      setScore({ score: local.score, total: local.total, retried: 0 });
      setStage("result");
      void (async () => {
        try {
          let posted = await postCompleteOutcome(base);
          if (posted.kind === "error") posted = await postCompleteOutcome(base);
          if (posted.kind === "done") {
            applyComplete(posted.data, false);
            router.refresh();
            return;
          }
          // Sonuç ekranı zaten açık: kayıt arkada yoklanır, gelince yıldız ve yol bilgisi eklenir.
          if (posted.kind === "grading" || posted.kind === "lost") enterGradingWait(false);
        } finally {
          completeInFlight.current = false;
        }
      })();
      return;
    }
    completeInFlight.current = true;
    setLoading(true);
    try {
      const posted = await postCompleteOutcome(base);
      if (posted.kind === "done") {
        applyComplete(posted.data, true);
        router.refresh();
        return;
      }
      if (posted.kind === "grading" || posted.kind === "lost") {
        enterGradingWait(true);
        return;
      }
      toast.error(typeof posted.data.error === "string" ? posted.data.error : "Kaydedilemedi.");
    } finally {
      setLoading(false);
      completeInFlight.current = false;
    }
  }

  /** "Yeniden dene" (bekleme uzadıysa): aynı kimlikle bitirme; sunucu çift notlamaz. */
  async function retryGradingNow() {
    if (completeInFlight.current) return;
    completeInFlight.current = true;
    setGradingLate(false);
    setGradingSince(Date.now());
    try {
      const posted = await postCompleteOutcome(answersRef.current);
      if (posted.kind === "done") {
        applyComplete(posted.data, true);
        router.refresh();
      } else if (posted.kind === "error") {
        toast.error(typeof posted.data.error === "string" ? posted.data.error : "Kaydedilemedi.");
      }
    } finally {
      completeInFlight.current = false;
    }
  }

  /**
   * × her durumda çalışır (30 Ekim 2026). Kaydedilmemiş cevap varsa önce özet: kaç cevap sunucuda,
   * kaçı yalnız bu cihazda. Öğrenci yine de çıkabilir; taslak geri dönüşte yüklenir.
   */
  function requestExit() {
    const home = `/deneme-sinavlari/${prepId}`;
    if (stage === "play" && savesEnabled() && diffAnswerKeys(answersRef.current, savedAnswersRef.current).length) {
      setExitPrompt(true);
      return;
    }
    router.push(home);
  }

  function updateAnswer(key: string, value: unknown, options?: { typing?: boolean }) {
    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    const parsed = /^\d+$/.test(key) ? Number(key) : index;
    scheduleSave(next, Math.max(parsed, index), options?.typing ? SAVE_TYPING_DEBOUNCE_MS : SAVE_DEBOUNCE_MS);
  }

  function finishCards(base: Record<string, unknown>) {
    // Tam sayı (30 Ekim 2026, Paket I #7): "Bildim" sayısı / kart; "Zorlandım" ayrı satırda, puana girmez.
    // Önceden ağırlıklı kredi (Zorlandım 0,6) "6.6/8" yazıyordu.
    const tally = activityTally({ type: "cards", cards }, base);
    setCardSummary({
      known: tally.correct,
      partial: tally.partial,
      total: Math.max(1, tally.total),
      repeated: missedCards(base, cards.length).length,
    });
    void finish(base);
  }

  /**
   * Kartı değerlendir. Bildim tam, Zorlandım kısmi, Bilemedim sıfır kredi.
   * İlk turda hiç bilinmeyen kart sonda bir kez daha gelir; tekrar turu skoru değiştirmez.
   */
  function rateCard(quality: 1 | 3 | 5) {
    setFlipped(false);
    setRevealedCard(-1);
    if (cardRepeat) {
      if (cardRepeat.pos + 1 < cardRepeat.list.length) {
        setCardRepeat({ ...cardRepeat, pos: cardRepeat.pos + 1 });
      } else {
        finishCards(answersRef.current);
      }
      return;
    }
    const nextAnswers = { ...answersRef.current, [String(index)]: quality };
    updateAnswer(String(index), quality);
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      return;
    }
    const missed = missedCards(nextAnswers, cards.length);
    if (missed.length) setCardOffer(missed);
    else finishCards(nextAnswers);
  }

  async function loadLessonPodcast() {
    if (!topicId) return;
    setPodcastLoading(true);
    try {
      // 30 Ekim 2026 (Paket I #9): hazırlık podcast'iyle aynı hat; düşerse bir kez kendiliğinden, her denemede yeni
      // istek kimliğiyle (aynı kimlik "işlem tamamlandı" döner).
      const { res, data } = await postJsonWithRetry<{ code?: string; title?: string; chapters?: unknown }>(
        "/api/learning/exam-prep/lesson-podcast",
        () => ({ prepId, topicId, clientRequestId: crypto.randomUUID() }),
      );
      if (res.status === 402) {
        // Ücretsiz hesapta sesli tekrar Plus'ta: kapı "doldu" demez, Pazartesi'ye geri saymaz.
        setPaywallGate(data.code === "premium_required" ? LESSON_PODCAST_GATE : gateCopy);
        setPaywall(true);
        return;
      }
      if (!res.ok || !Array.isArray(data.chapters)) {
        toast.error("Sesli tekrar bu sefer gelmedi. Yeniden dene.");
        return;
      }
      setLessonPodcast({ title: data.title ?? topicLabel ?? "Sesli tekrar", chapters: data.chapters as unknown[] });
    } catch {
      toast.error("Sesli tekrar bu sefer gelmedi. Yeniden dene.");
    } finally {
      setPodcastLoading(false);
    }
  }

  async function loadFeedback() {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        // Eğitmen notu ders içi yardım: ücretsizde derse dahil, dolan günlük adım sınırı.
        setPaywallGate(nodeGateForCode(data.code, gateCopy, isPremiumAccount));
        setPaywall(true);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Geri bildirim alınamadı.");
        return;
      }
      setFeedback(data.feedback ?? null);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  const questions = payload.questions ?? [];
  const items = payload.items ?? [];
  const cards = payload.cards ?? [];
  const chapters = payload.chapters ?? [];
  // Şema tutmazsa düz markdown'a düşülür; ders hiç açılmamasındansa
  // biçimsiz açılsın.
  const structuredLesson = useMemo(() => (payload.lesson ? readPlayLessonV3(payload.lesson) : null), [payload.lesson]);
  const lessonBuilding = payload.type === "lesson" && payload.building === true;

  // Parça parça açılan ders: yazım sürerken yeni kavramlar kayıttan okunur. Öğrenci ilk
  // kavramı okurken sonrakiler denetlenip eklenir; bitince bayrak kalkar.
  useEffect(() => {
    if (!lessonBuilding || !attemptId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Değişmeyen cevapla ekran yeniden çizilmesin.
    let last = "";
    const poll = async () => {
      try {
        const res = await fetch("/api/learning/exam-prep/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, nodeId, attemptId, action: "progress", lessonFormat: 3 }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; payload?: Payload };
        if (!stopped && res.ok && data.payload) {
          const seen = JSON.stringify(data.payload);
          if (seen !== last) {
            last = seen;
            setPayload(data.payload);
          }
          if (data.payload.building !== true) return;
        }
      } catch {
        // Bağlantı anlık koptu: bir sonraki turda yeniden sorulur.
      }
      if (!stopped) timer = setTimeout(poll, LESSON_PROGRESS_POLL_MS);
    };
    timer = setTimeout(poll, LESSON_PROGRESS_POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [lessonBuilding, attemptId, prepId, nodeId]);

  const quizBuilding = payload.type === "quiz" && payload.building === true;
  useEffect(() => {
    if (!quizBuilding || !attemptId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = "";
    const poll = async () => {
      try {
        const res = await fetch("/api/learning/exam-prep/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, nodeId, attemptId, action: "progress", lessonFormat: 3 }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; payload?: Payload };
        if (!stopped && res.ok && data.payload) {
          if (data.payload.generationFailed) {
            setPayload({ ...data.payload, type: "quiz", questions: [], building: false, generationFailed: true });
            setGenerationError("Hazırlanıyor. Yeniden dene.");
            setStage("setup");
            return;
          }
          let building = data.payload.building === true;
          setPayload((current) => {
            const incoming = data.payload!;
            const next =
              incoming.type === "quiz" && current.type === "quiz"
                ? {
                    ...incoming,
                    questions: mergeStreamedQuestions(current.questions ?? [], incoming.questions ?? []),
                  }
                : incoming;
            building = next.building === true;
            const seen = JSON.stringify(next);
            if (seen === last) return current;
            last = seen;
            return next;
          });
          if (!building) return;
        }
      } catch {
        // Bağlantı anlık koptu: bir sonraki turda yeniden sorulur.
      }
      if (!stopped) timer = setTimeout(poll, LESSON_PROGRESS_POLL_MS);
    };
    timer = setTimeout(poll, LESSON_PROGRESS_POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [quizBuilding, attemptId, prepId, nodeId]);
  const cardIndex = cardRepeat ? (cardRepeat.list[cardRepeat.pos] ?? index) : index;
  const cardsPlaying = stage === "play" && payload.type === "cards" && !cardOffer;
  const coachItem =
    payload.type === "quiz"
      ? questions[index]?.text
      : payload.type === "true_false"
        ? items[index]?.text
        : payload.type === "cards"
          ? cards[cardIndex]?.front
          : payload.type === "oral"
            ? questions[index]?.prompt
            : payload.type === "lesson"
              ? payload.title
              : null;
  const cinematicLesson =
    stage === "play" && payload.type === "lesson" && Boolean(structuredLesson);
  const podcastCheck =
    payload.type === "podcast" && Array.isArray(payload.check)
      ? payload.check.filter((question) => typeof question?.text === "string" && Array.isArray(question.options))
      : [];
  // Dinleme kontrolü testteki gibi oturum çubuğuyla (tek çıkış ×) açılır; oynatıcı kendi çıkışını taşır.
  const cinematicPodcast =
    stage === "play" &&
    payload.type === "podcast" &&
    !podcastCheckOpen &&
    normalizeChapters(chapters).length > 0;
  const cinematicLoading = stage === "setup" && loading && kind !== "readiness";
  const oralRows: OralTopicRow[] = oralTopics.length
    ? oralTopics
    : topicLabel
      ? [{ id: "current", label: topicLabel, pct: 0 }]
      : [{ id: "current", label: prepTitle, pct: 0 }];
  const selectedOralLabels = oralRows
    .filter((topic) => oralSelected.includes(topic.id))
    .map((topic) => topic.label);
  // "Tüm sınav" seçildiyse başlık düğümün konusu değil (Paket I #8): sorular bütün konulardan gelirken sonuç
  // "Diziler" yazıyordu.
  const oralTopicLabel = oralSelected.includes(ORAL_ALL_TOPICS)
    ? ALL_TOPICS_LABEL
    : selectedOralLabels.join(", ") || topicLabel || prepTitle;
  const oralVoiceLabel = oralVoiceTopicLabel(
    isOral ? selectedOralLabels : [topicLabel ?? prepTitle],
    topicLabel || prepTitle,
  );
  const oralReviewItems = oralReport?.items?.length
    ? oralReport.items.map((item) => oralReviewItemFromGrade(item))
    : payload.type === "oral"
      ? reviewItemsFromQuestions(questions, answers)
      : reviewItemsFromTranscript(oralTranscript);
  const oralFraction = oralReport?.items?.length ? oralScoreFraction(oralReport) : null;
  const oralPct =
    oralReport?.pct ??
    (payload.type === "oral"
      ? oralWrittenPercent(score.score, score.total)
      : oralVoicePercent(oralTranscript));
  // Sonuç beklenirken de tek çıkış × görünür (sözlü kurulum ekranları kendi çıkışını taşır).
  const oralOwnsChrome =
    isOral && stage !== "restoring" && stage !== "grading" && !(stage === "play" && payload.type === "oral");
  /** × özetinin sayıları: kaç cevap sunucuda, kaçı yalnız bu cihazda (taslakta). */
  const exitSummary = exitPrompt ? answerSaveSummary(answersRef.current, savedAnswersRef.current) : null;
  // Boşluk tuşu kartı çevirir (Astra). Odak bir düğmedeyse tarayıcı zaten
  // o düğmeye basıyor; ikinci kez çevirmeyelim.
  useEffect(() => {
    if (!cardsPlaying) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setFlipped((value) => !value);
      setRevealedCard(cardIndex);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cardsPlaying, cardIndex]);

  // Podcast puanlanmaz (19 Ekim 2026, canlı): soru yokken sonuç "Doğru cevaplar 1/1 · Doğruluk %100"
  // diyordu. Dinleme kontrolü cevaplandıysa (20 Ekim 2026) "2/3" gösterilir; atlandıysa yine puansız.
  // Sonuç sayfasıyla aynı kural (`unscoredResult`).
  const unscored = unscoredResult(kind, score.total);
  const heroScore = payload.type === "cards" && cardSummary ? cardSummary.known : score.score;
  const heroTotal = payload.type === "cards" && cardSummary ? cardSummary.total : score.total;
  const showCoach =
    stage === "play" &&
    Boolean(coachItem) &&
    !isTimedExam &&
    payload.type !== "voice" &&
    payload.type !== "podcast" &&
    !cinematicLesson;

  /**
   * Eğitmen cevap verdi: soru henüz kilitlenmediyse bu soru ipuçlu sayılır (20 Ekim 2026). Testte
   * kilit "Kontrol et", doğru/yanlışta seçim; sözlüde cevap ilerleyince sonraki soruya geçilir.
   * Cevaptan sonraki açıklama ipucu değil.
   */
  function markHint() {
    if (payload.type !== "quiz" && payload.type !== "true_false" && payload.type !== "oral") return;
    const key = String(index);
    const locked =
      payload.type === "quiz"
        ? revealedRef.current.has(key)
        : payload.type === "true_false"
          ? answersRef.current[key] !== undefined
          : false;
    if (locked) return;
    hintsUsedRef.current = { ...hintsUsedRef.current, [key]: true };
  }

  return {
    prepId,
    nodeId,
    kind,
    prepTitle,
    topicId,
    todayMood,
    reviewSaved,
    rewriteHref,
    resumeEnabled,
    sourceName,
    language,
    sources,
    unitTitle,
    activityMinutes,
    router,
    topicLabel,
    gateCopy,
    meta,
    isOral,
    signalStage,
    stage,
    setStage,
    familiarity,
    setFamiliarity,
    mood,
    setMood,
    difficulty,
    setDifficulty,
    podcastLength,
    setPodcastLength,
    voiceLocked,
    voiceMode,
    setVoiceMode,
    oralSelected,
    setOralSelected,
    oralMoodId,
    setOralMoodId,
    oralLength,
    setOralLength,
    oralReport,
    setOralReport,
    oralPreflight,
    setOralPreflight,
    setOralTranscript,
    oralReviewIndex,
    setOralReviewIndex,
    oralReviewTab,
    setOralReviewTab,
    loading,
    setLoading,
    generationError,
    queueNote,
    generationFailure,
    paywall,
    setPaywall,
    paywallGate,
    setPaywallGate,
    payload,
    setPayload,
    attemptId,
    index,
    setIndex,
    tutorMessages,
    setTutorMessages,
    answers,
    setAnswers,
    flipped,
    setFlipped,
    revealedCard,
    setRevealedCard,
    cardOffer,
    setCardOffer,
    cardRepeat,
    setCardRepeat,
    cardSummary,
    setCardSummary,
    score,
    setScore,
    starsEarned,
    spentMinutes,
    oralGrade,
    writtenReview,
    setWrittenReview,
    nextHref,
    levelHint,
    topicGain,
    pathChange,
    reviewScheduled,
    gainOpen,
    setGainOpen,
    feedback,
    setFeedback,
    feedbackLoading,
    tfRevealed,
    setTfRevealed,
    podcastLoading,
    podcastCheckOpen,
    setPodcastCheckOpen,
    lessonPodcast,
    setLessonPodcast,
    revealedRef,
    saveCursorRef,
    pendingSaves,
    saveError,
    draftRestored,
    setExitPrompt,
    gradingLate,
    answersRef,
    isTimedExam,
    timeLeft,
    persistAnswers,
    formatTimer,
    start,
    finish,
    retryGradingNow,
    requestExit,
    updateAnswer,
    finishCards,
    rateCard,
    loadLessonPodcast,
    loadFeedback,
    questions,
    items,
    cards,
    chapters,
    structuredLesson,
    lessonBuilding,
    quizBuilding,
    cardIndex,
    cardsPlaying,
    coachItem,
    cinematicLesson,
    podcastCheck,
    cinematicPodcast,
    cinematicLoading,
    oralRows,
    oralTopicLabel,
    oralVoiceLabel,
    oralReviewItems,
    oralFraction,
    oralPct,
    oralOwnsChrome,
    exitSummary,
    unscored,
    heroScore,
    heroTotal,
    showCoach,
    markHint,
  };
}

/** Ekran bileşenlerinin okuduğu oturum durumu ve işlemleri. */
export type NodeLifecycle = ReturnType<typeof useNodeLifecycle>;
