"use client";

import { useRef, useState, useEffect, type ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CreditGate } from "@/components/paywall/credit-gate";
import { CortexMark } from "@/components/brand/cortex-mark";

import {
  ArrowLeft,
  AudioLines,
  Camera,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  EllipsisVertical,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Mic,
  Paperclip,
  PenLine,
  Plus,
  Send,
  Zap,
  Lightbulb,
  Smile,
  SlidersHorizontal,
  Brush,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createRecognizer, speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import { EXAM_QUICK_COMMANDS } from "@/lib/learning/exam-chat-chrome";
import {
  isRecordingSupported,
  mergeTranscript,
  startRecording,
  transcribe,
  type Recorder,
} from "@/lib/learning/voice-recorder";
import { subscribeComposerAttach } from "@/lib/student/composer-bridge";
import { StartHub } from "@/components/parity/start-hub";
import { SubjectModal } from "@/components/parity/subject-modal";
import { UploadModal } from "@/components/parity/upload-modal";
import { MathKeyboard } from "@/components/parity/math-keyboard";
import { UpgradeAside } from "@/components/paywall/upgrade-aside";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { MessageActions, type Rating } from "@/components/chat/message-actions";
import { TutorReplyView } from "@/components/chat/tutor-reply-view";
import "@/styles/parity-sor.css";
import "@/styles/parity-shell.css";

type Message = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  /** Kaydedilmiş yanıtın satır kimliği; oylama bunsuz yapılamıyor. */
  id?: string;
  rating?: Rating;
};

function SorTypingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label ? (
        <span className="text-xs text-[var(--cs-muted)]">{label}</span>
      ) : null}
      <div className="cs-sor-typing" role="status" aria-label={label ?? "Yanıt hazırlanıyor"}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/**
 * Hata balonunda öğrenciye ne yazılacağı. Sunucudan gelen kısa Türkçe
 * mesajlar (ör. "Belgene şu an erişilemiyor.") aynen geçer; teknik görünen
 * ("fetch failed", "Unexpected token", kod adı) her şey tek dost cümleye
 * düşer. Ham 500 metni ekrana çıkmıyor.
 */
const FRIENDLY_ERROR = "Yanıt alınamadı. Bağlantını kontrol edip tekrar dene.";

function assistantErrorContent(error: unknown) {
  if (!(error instanceof Error) || !error.message) return FRIENDLY_ERROR;
  const text = error.message.trim();
  const technical =
    /(fetch|failed|error|exception|econn|timeout|token|undefined|null|status|_|\{|\})/i.test(text) ||
    !/[ .]/.test(text) ||
    text.length > 160;
  return technical ? FRIENDLY_ERROR : text;
}

function plainForSpeech(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function DrawSquiggle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 15c1.8-5 3.2 4.5 5.2-.2 1.6-3.8 3 4.8 5 .4 1.4-3 2.2-4.2 5.6-.8" />
    </svg>
  );
}

const quickActions = [
  { id: "hint", label: "İpucu ver", prompt: "Bana çözümü söylemeden bir ipucu ver." },
  { id: "simpler", label: "Daha basit anlat", prompt: "Aynı konuyu daha basit anlat." },
  { id: "steps", label: "Adım adım çöz", prompt: "Adım adım, her adımı gerekçelendirerek çöz." },
  { id: "similar", label: "Benzer örnek", prompt: "Aynı mantıkta benzer bir örnek soru üret ve çöz." },
  { id: "quiz", label: "Beni test et", prompt: "Bu konudan bana 3 soru sor ve yanıtlarımı bekle." },
  { id: "summary", label: "Kısa özet", prompt: "Konuşmanın kısa bir özetini çıkar." },
  { id: "advanced", label: "Gelişmiş analiz", prompt: "Bu konuyu ileri düzeyde ayrıntılı analiz et.", advanced: true },
];

/**
 * Yanıt sonrası devam önerileri.
 *
 * Referans ürün bunları yapay zekâya ürettiriyor; biz sabit tutuyoruz çünkü üçü de her
 * konuda geçerli ve fazladan bir AI çağrısı (yani fazladan kredi) yakmıyor.
 */
const FOLLOW_UPS = [
  { id: "simpler", label: "Daha basit anlat", prompt: "Aynı konuyu daha basit anlat." },
  { id: "similar", label: "Benzer örnek ver", prompt: "Aynı mantıkta benzer bir örnek soru üret ve çöz." },
  { id: "quiz", label: "Beni test et", prompt: "Bu konudan bana 3 soru sor ve yanıtlarımı bekle." },
] as const;

const COMPOSER_MODES = [
  {
    id: "solution",
    label: "Çözüm",
    hint: "Eksiksiz adım adım çözüm",
    icon: Zap,
    prefix: "Bu soruyu eksiksiz adım adım çöz: ",
  },
  {
    id: "tips",
    label: "Öneriler",
    hint: "İpucu ve yönlendirme",
    icon: Lightbulb,
    prefix: "Çözümü vermeden ipucu ve öneriler sun: ",
  },
  {
    id: "today",
    label: "Bugün",
    hint: "Günlük hedefe uygun soru",
    icon: Smile,
    prefix: "Bugünkü öğrenme hedefime uygun bir soru öner: ",
  },
] as const;

const SUBJECTS = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Türkçe",
  "İngilizce",
  "Tarih",
  "Coğrafya",
];

function ChatPanelSession({
  initialConversationId,
  initialDocumentId,
  initialMessages = [],
  hasDocuments,
  variant = "default",
  greetingLine,
  greetingSubline,
  audience = "student",
  startPrompt,
  startLabel = "Başla",
  showEmptyStarter = true,
  composerMode = "full",
  placeholder,
  showSubjectPicker = true,
  showAttachments = true,
  returnPath = "/ogretmen",
  chatCreditCost,
  isPremium,
  tutorStyleLabel,
  quotaHint,
  starterPrompts,
  feedbackEnabled = false,
  dailyDrillCount = 0,
  prepId,
  examChrome = false,
}: {
  initialConversationId?: string;
  initialDocumentId?: string;
  initialMessages?: Message[];
  hasDocuments: boolean;
  variant?: "default" | "parity";
  greetingLine?: string;
  greetingSubline?: string;
  audience?: "student" | "parent";
  startPrompt?: string;
  startLabel?: string;
  showEmptyStarter?: boolean;
  composerMode?: "full" | "minimal" | "parity";
  placeholder?: string;
  showSubjectPicker?: boolean;
  showAttachments?: boolean;
  returnPath?: string;
  chatCreditCost?: number | null;
  isPremium?: boolean;
  tutorStyleLabel?: string;
  quotaHint?: string | null;
  starterPrompts?: { label: string; prompt: string }[];
  /**
   * Sohbet bir sınav hazırlığının içinden açıldıysa o hazırlığın kimliği.
   * Sunucu bununla hangi sınav, kaç gün kaldı ve en son hangi ders
   * okundu bilgisini modele veriyor.
   */
  prepId?: string;
  /**
   * Oylama sütunları veritabanında var mı. Sunucu karar veriyor; göç
   * uygulanmadan başparmak göstermek, basıldığında hata veren bir düğme
   * demek olurdu.
   */
  feedbackEnabled?: boolean;
  /** Yanlış defterinde bekleyen soru sayısı. 0 ise günün turu kartı çıkmıyor. */
  dailyDrillCount?: number;
  /**
   * Sınav hazırlığının sohbeti. Karşılama, çipler, oluşturucu ve hızlı
   * komutlar bu kabuğa göre çizilir. Kota kapısı durur; satış kartı girmez.
   */
  examChrome?: boolean;
}) {
  const shellAccount = useStudentShellAccount();
  // Kurucuda kota ve mesaj başı maliyet satırı yok: hiçbir mesaj kredi düşürmüyor.
  const founder = shellAccount?.isAdmin === true;
  const showUpgrade =
    !examChrome && (shellAccount ? shellAccount.showsUpgradeChrome : !isPremium);
  const allowAdvanced = shellAccount?.audience === "sigma";
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  // `?belge=` ile gelen öğrenci belgesinden çalışmak istiyor: belge modu
  // açık başlar ve kilit görünür. Aksi hâlde konuşma sessizce genel bilgiye
  // düşerdi ve "belgemi okumadı" şikâyeti gelirdi.
  const [useDocuments, setUseDocuments] = useState(Boolean(initialDocumentId));
  /** true = Yalnızca Belgem (varsayılan); false = Belgem + Genel Bilgi */
  const [documentsOnly, setDocumentsOnly] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(initialConversationId);
  const activeDocumentId = useRef<string | undefined>(initialDocumentId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Aynı kullanıcı mesajı yeniden denendiğinde (regenerate) çift ücret olmasın. */
  const chatOperationIds = useRef<Map<string, string>>(new Map());
  const [keyboardInset, setKeyboardInset] = useState(0);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState("Matematik");
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<Recorder | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const [startHubOpen, setStartHubOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingRemote, setPendingRemote] = useState<{
    documentId: string;
    fileName: string;
  } | null>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [talking, setTalking] = useState(false);
  const [composerAssistOpen, setComposerAssistOpen] = useState(false);
  const [composerAssist, setComposerAssist] = useState<
    (typeof COMPOSER_MODES)[number]["id"] | null
  >(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(3);

  useEffect(() => {
    if (variant !== "parity") return;
    let cancelled = false;
    fetch("/api/profile/me")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data?.daily_goal_minutes) return;
        setDailyGoalMinutes(Number(data.daily_goal_minutes) || 3);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [variant]);

  function openComposerDialog(dialog: "image_upload" | "sketch" | "profile") {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    params.set("dialog", dialog);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (initialMessages.length > 0) return;
    try {
      const pending = sessionStorage.getItem("cortex-entry-prompt");
      if (pending?.trim()) {
        setInput(pending.trim());
        sessionStorage.removeItem("cortex-entry-prompt");
      }
    } catch {
      /* ignore */
    }
    try {
      const mod = new URLSearchParams(window.location.search).get("mod");
      if (mod === "podcast") {
        setInput("Bu dersten 5 dakikalık podcast tarzı, konuşma dilinde bir anlatım yap.");
      }
      if (mod === "sozlu") {
        setInput(
          "Sözlü deneme gibi davran. Konuyu sor, kısa sorular sor, cevaplarımı bekle ve net geri bildirim ver.",
        );
      }
    } catch {
      /* ignore */
    }
  }, [initialMessages.length]);

  const isParity = variant === "parity";
  const isMinimalSor = isParity && composerMode === "minimal";
  const isParitySor = isParity && composerMode === "parity";

  const sorChatActive = isMinimalSor && (messages.length > 0 || loading);

  useEffect(() => {
    if (!isMinimalSor) return;
    const root = document.querySelector(".cs-sor-screen--chat");
    if (!root) return;
    root.classList.toggle("cs-sor-screen--active-chat", sorChatActive);
    return () => root.classList.remove("cs-sor-screen--active-chat");
  }, [isMinimalSor, sorChatActive]);

  useEffect(() => {
    if (!isMinimalSor && !isParitySor) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "end",
    });
  }, [messages, loading, isMinimalSor, isParitySor]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAttachMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachMenuOpen]);

  // Sayfadan çıkılırken mikrofon kapanmalı: açık kalan bir kayıt tarayıcı
  // sekmesinde "kaydediyor" göstergesini yakılı bırakır. Geçmiş satırı
  // bileşeni baştan kurunca sürmekte olan yanıt da yeni konuşmaya yazılmasın.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (!quickOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickOpen]);

  function pushAssistantError(error: unknown) {
    const content = assistantErrorContent(error);
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") {
        copy[copy.length - 1] = { role: "assistant", content, isError: true };
        return copy;
      }
      copy.push({ role: "assistant", content, isError: true });
      return copy;
    });
  }

  async function handleAttachmentFile(file: File) {
    setAttachMenuOpen(false);
    setLoading(true);
    try {
      const docId = await uploadAttachment(file);
      const prompt = file.type.startsWith("image/")
        ? "Fotoğraftaki soruyu adım adım çöz."
        : "Yüklediğim dosyayı özetle ve sorularımı yanıtlamaya hazır ol.";
      await send(prompt, false, docId ?? undefined, true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Dosya gönderilemedi.",
      );
      setLoading(false);
    }
  }

  function attachPending(file: File) {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingRemote(null);
    setPendingFile(file);
    setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  function attachRemote(doc: { documentId: string; fileName: string }) {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setPendingRemote(doc);
  }

  useEffect(() => {
    if (variant !== "parity") return;
    return subscribeComposerAttach({
      attachFile: (file) => {
        attachPending(file);
        toast.success("Eklendi — göndermek için mesajını yaz.");
        composerRef.current?.focus();
      },
      attachRemote: (doc) => {
        attachRemote(doc);
        toast.success("Telefon yüklemesi composer’a eklendi.");
        composerRef.current?.focus();
      },
    });
    // attachPending/attachRemote are stable for this subscription
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 48 ? inset : 0);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  function clearPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setPendingRemote(null);
  }

  function insertMath(symbol: string) {
    const el = composerRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const next = `${input.slice(0, start)}${symbol}${input.slice(end)}`;
    setInput(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + symbol.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  /** Klavyedeki ⌫ — seçim varsa onu, yoksa imlecin solundaki karakteri siler. */
  function backspaceComposer() {
    const el = composerRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const cutFrom = start === end ? Math.max(0, start - 1) : start;
    const next = `${input.slice(0, cutFrom)}${input.slice(end)}`;
    setInput(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(cutFrom, cutFrom);
    });
  }

  /** Uzun bir ifadenin ortasına dönebilmek için imleç okları. */
  function moveComposerCaret(direction: -1 | 1) {
    const el = composerRef.current;
    if (!el) return;
    const pos = Math.min(
      input.length,
      Math.max(0, (el.selectionStart ?? 0) + direction),
    );
    el.focus();
    el.setSelectionRange(pos, pos);
  }

  function resetParityThread() {
    activeDocumentId.current = undefined;
    setMessages([]);
    conversationId.current = undefined;
    clearPending();
    setInput("");
    setStatus(null);
    if (typeof window !== "undefined" && window.location.search.includes("sohbet")) {
      window.history.replaceState({}, "", "/ogretmen");
    }
  }

  async function sendComposer() {
    const file = pendingFile;
    const remote = pendingRemote;
    const text = input.trim();
    if (!file && !remote && !text) {
      setStartHubOpen(true);
      return;
    }
    if (remote) {
      const prompt =
        text || "Yüklediğim dosyayı özetle ve sorularımı yanıtlamaya hazır ol.";
      const docId = remote.documentId;
      clearPending();
      setInput("");
      setLoading(true);
      try {
        await send(prompt, false, docId, true);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Dosya gönderilemedi.",
        );
        setLoading(false);
      }
      return;
    }
    if (file) {
      const prompt =
        text ||
        (file.type.startsWith("image/")
          ? "Fotoğraftaki soruyu adım adım çöz."
          : "Yüklediğim dosyayı özetle ve sorularımı yanıtlamaya hazır ol.");
      clearPending();
      setInput("");
      setLoading(true);
      try {
        const docId = await uploadAttachment(file);
        await send(prompt, false, docId ?? undefined, true);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Dosya gönderilemedi.",
        );
        setLoading(false);
      }
      return;
    }
    await send(
      (() => {
        const mode = COMPOSER_MODES.find((m) => m.id === composerAssist);
        if (!mode || !text) return text;
        if (mode.id === "today") {
          return `${mode.prefix}(Günlük hedefim: ${dailyGoalMinutes} dakika.) ${text}`;
        }
        return `${mode.prefix}${text}`;
      })(),
    );
  }

  async function uploadAttachment(file: File): Promise<string | null> {
    const form = new FormData();
    form.set("file", file);
    const uploadRes = await fetch("/api/documents/upload", {
      method: "POST",
      body: form,
    });
    const uploaded = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      throw new Error(uploaded.error ?? "Yükleme başarısız.");
    }
    return uploaded.documentId as string;
  }

  async function send(
    text: string,
    advanced = false,
    imageDocumentId?: string,
    allowWhileLoading = false,
  ) {
    if (!text.trim() || (loading && !allowWhileLoading)) return;
    if (imageDocumentId) activeDocumentId.current = imageDocumentId;
    const prefixed =
      variant === "parity" && showSubjectPicker && subject
        ? `[${subject}] ${text.trim()}`
        : text.trim();
    setLoading(true);
    setStatus(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: prefixed }]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const opKey = prefixed.trim();
    let operationId = chatOperationIds.current.get(opKey);
    if (!operationId) {
      operationId = crypto.randomUUID();
      chatOperationIds.current.set(opKey, operationId);
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: prefixed,
          operationId,
          actionCode: advanced && allowAdvanced ? "AI_CHAT_ADVANCED" : "AI_CHAT_STANDARD",
          conversationId: conversationId.current,
          useDocuments,
          documentsOnly: useDocuments ? documentsOnly : true,
          audience,
          imageDocumentId: activeDocumentId.current,
          prepId,
        }),
      });

      if (res.status === 402) {
        setMessages((prev) => prev.slice(0, -1));
        if (audience === "parent") {
          const payload = await res.json().catch(() => ({}));
          toast.error(
            payload.error ??
              "Ücretsiz Destek hakkın doldu. Plus gerekmez.",
          );
          return;
        }
        setPaywall(true);
        return;
      }

      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Yanıt alınamadı.");
      }

      const newConversation = res.headers.get("X-Conversation-Id");
      if (newConversation) conversationId.current = newConversation;
      // Sohbet kaydedilmemişse başlık boş geliyor; o durumda oy düğmesi de
      // çıkmıyor.
      const messageId = res.headers.get("X-Message-Id") || undefined;
      const credits = res.headers.get("X-Credits-Used");
      const sourceCount = Number(res.headers.get("X-Sources") ?? "0");
      // Hangi nottan geldiği "3 kaynak"tan anlamlı. Kaynak bulunamadığında
      // cevabın genel bilgi olduğunu yazıyoruz: eskiden bu sessizce geçiyordu.
      let sourceDoc = "";
      try {
        sourceDoc = decodeURIComponent(res.headers.get("X-Source-Doc") ?? "");
      } catch {
        sourceDoc = "";
      }
      const sourcePage = res.headers.get("X-Source-Page");
      const citation =
        sourceDoc && sourcePage
          ? `${sourceDoc} · s.${sourcePage}`
          : sourceDoc || (sourceCount ? `${sourceCount} kaynak` : "");
      const sourceLabel = sourceCount
        ? ` · Kaynak: ${citation}`
        : useDocuments
          ? documentsOnly
            ? " · belgede yok"
            : " · genel bilgi"
          : "";
      setStatus(
        `${res.headers.get("X-Model") ?? ""} · ${credits ?? "0"} kredi${sourceLabel}`,
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", id: messageId },
      ]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        assistant += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: assistant,
            id: messageId,
          };
          return copy;
        });
      }
      try {
        const streakRes = await fetch("/api/streak");
        const streakPayload = await streakRes.json().catch(() => ({}));
        if (typeof streakPayload.streak === "number") {
          localStorage.setItem(
            "cortex-streak-days",
            String(streakPayload.streak),
          );
        }
      } catch {
        localStorage.setItem("cortex-streak-days", "1");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // Durdurulan yanıt boş kalmasın: yarım metin varsa duruyor, hiç
        // gelmediyse (istek daha cevaplanmamışken durduruldu) tek satır ve
        // "Tekrar dene" — öğrenci soruyu yeniden yazmak zorunda kalmıyor.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const stopped = { role: "assistant" as const, content: "Yanıt durduruldu.", isError: true };
          if (last?.role === "assistant" && !last.content) {
            return [...prev.slice(0, -1), stopped];
          }
          if (last?.role === "user") return [...prev, stopped];
          return prev;
        });
        return;
      }
      pushAssistantError(error);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  function regenerateLast() {
    if (loading) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser?.content) return;
    setMessages((prev) => {
      const next = [...prev];
      while (next.length && next[next.length - 1]?.role === "assistant") {
        next.pop();
      }
      if (next.length && next[next.length - 1]?.role === "user") {
        next.pop();
      }
      return next;
    });
    void send(lastUser.content);
  }

  function talkLastAnswer() {
    if (talking) {
      stopSpeech();
      setTalking(false);
      return;
    }
    const last = [...messages]
      .reverse()
      .find((item) => item.role === "assistant" && !item.isError && item.content.trim());
    const plain = last ? plainForSpeech(last.content) : "";
    if (!plain) return;
    setTalking(true);
    speakTurkish(plain, {
      onEnd: () => setTalking(false),
      onError: () => setTalking(false),
    });
  }

  const hasComposerPayload = Boolean(input.trim() || pendingFile || pendingRemote);
  const canTalk = messages.some(
    (item) => item.role === "assistant" && !item.isError && item.content.trim().length > 0,
  );
  const showExamTalk = examChrome && messages.length > 0 && !hasComposerPayload;
  const showExamSend = examChrome && (hasComposerPayload || loading);

  const showMinimalEmpty = isMinimalSor && messages.length === 0 && !loading;
  const showMinimalMessages = isMinimalSor && (messages.length > 0 || loading);
  const showParityEmpty = isParitySor && messages.length === 0 && !loading;
  const showParityThread = isParitySor && (messages.length > 0 || loading);
  // Öneri çipleri yalnızca dolu, hatasız bir yanıtın ardından çıkıyor:
  // yazarken, hata ekranında ya da kullanıcı sırasındayken görünmüyor.
  function setRating(index: number, rating: Rating) {
    setMessages((prev) =>
      prev.map((item, i) => (i === index ? { ...item, rating } : item)),
    );
  }

  const lastMessage = messages[messages.length - 1];
  const lastIsAnswer =
    lastMessage?.role === "assistant" &&
    !lastMessage.isError &&
    lastMessage.content.trim().length > 0;

  // Jenerik "yükleniyor" yerine ne beklediğini söylüyor — Astra'daki "Çözüm
  // arıyor" gibi. Ekstra istek yok, yalnızca zaten elimizdeki duruma göre metin.
  const thinkingLabel = activeDocumentId.current
    ? "Belgeni inceliyor…"
    : useDocuments
      ? "Notunu tarıyor…"
      : "Düşünüyor…";

  function appendTranscript(text: string) {
    if (!text.trim()) return;
    setInput((prev) => mergeTranscript(prev, text));
  }

  /**
   * Kaydı bitirir ve sunucuda çözümletir. Sessizlikle kendiliğinden de,
   * mikrofona ikinci kez dokunularak da buraya geliniyor.
   */
  async function finishRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    setListening(false);
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      if (!blob) return;
      const text = await transcribe(blob);
      if (text) appendTranscript(text);
      else {
        toast.error("Sesi çözümleyemedim", {
          description: "Bir kez daha dener misin?",
        });
      }
    } finally {
      setTranscribing(false);
    }
  }

  /**
   * Mikrofon: önce tarayıcının kendi tanıması, olmazsa sunucu çözümlemesi.
   *
   * Sıra bilerek böyle. Tarayıcı tanıması Chrome'da anında ve bedava çalışıyor;
   * yükleme beklemesi ve API bedeli yok. Safari ve Firefox'ta ise hiç yok — o
   * öğrenciler için `MediaRecorder` + sunucu çözümlemesi devreye giriyor.
   * Sunucu tarafı Plus'a kapalı olduğundan ücretsiz katmandaki bir Safari
   * kullanıcısına "yakında" demek yerine gerçeği söylüyoruz.
   */
  function startVoiceInput() {
    // İkinci dokunuş her iki yolda da dinlemeyi bitirir; buton "Kaydı bitir"
    // yazdığında gerçekten bitiriyor olmalı.
    if (recorderRef.current) {
      void finishRecording();
      return;
    }
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      return;
    }
    if (listening || transcribing) return;

    const recognizer = createRecognizer();
    if (recognizer) {
      recognizer.interimResults = false;
      recognizerRef.current = recognizer;
      setListening(true);
      recognizer.onresult = (event) => {
        appendTranscript(event.results[0]?.[0]?.transcript ?? "");
      };
      recognizer.onerror = () => {
        recognizerRef.current = null;
        setListening(false);
      };
      recognizer.onend = () => {
        recognizerRef.current = null;
        setListening(false);
      };
      recognizer.start();
      return;
    }

    if (!isRecordingSupported()) {
      toast.error("Mikrofon kullanılamıyor", {
        description: "Bu tarayıcı ses kaydını desteklemiyor.",
      });
      return;
    }
    void (async () => {
      const recorder = await startRecording({
        onAutoStop: () => void finishRecording(),
      });
      if (!recorder) {
        toast.error("Mikrofona erişemedim", {
          description: "Tarayıcı iznini kontrol eder misin?",
        });
        return;
      }
      recorderRef.current = recorder;
      setListening(true);
    })();
  }

  /**
   * Kaynak kilidi. Öğrencinin hangi bilgiden cevap aldığını her mesajdan
   * önce görmesi gerekiyor; bu yüzden bestecinin üstünde durur, ayarlarda
   * değil. Üç durum: yalnızca belgem, belgem + genel bilgi, genel sohbet.
   */
  const showSourceMode = hasDocuments || Boolean(initialDocumentId);
  function renderSourceMode(compact = false) {
    if (!showSourceMode) return null;
    const on = "rounded-full bg-amber-500/20 px-3 py-1 font-semibold text-amber-100";
    const off = "rounded-full px-3 py-1 text-[var(--cs-muted)] hover:text-[var(--cs-text)]";
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs",
          compact ? "cp-sor-source-mode mb-2 justify-center" : "mb-2 gap-2 px-3 py-2",
        )}
        role="group"
        aria-label="Kaynak modu"
      >
        <button
          type="button"
          className={useDocuments && documentsOnly ? on : off}
          aria-pressed={useDocuments && documentsOnly}
          onClick={() => {
            setUseDocuments(true);
            setDocumentsOnly(true);
          }}
        >
          🔒 Yalnızca belgem
        </button>
        <button
          type="button"
          className={useDocuments && !documentsOnly ? on : off}
          aria-pressed={useDocuments && !documentsOnly}
          onClick={() => {
            setUseDocuments(true);
            setDocumentsOnly(false);
          }}
        >
          🌐 Belgem + genel bilgi
        </button>
        <button
          type="button"
          className={
            !useDocuments
              ? "rounded-full bg-white/10 px-3 py-1 font-semibold text-[var(--cs-text)]"
              : off
          }
          aria-pressed={!useDocuments}
          onClick={() => setUseDocuments(false)}
        >
          Genel sohbet
        </button>
      </div>
    );
  }

  /** Hata balonunun altındaki tek çıkış: aynı soruyu yeniden gönder. */
  function renderRetry(index: number) {
    if (index !== messages.length - 1 || loading) return null;
    return (
      <button
        type="button"
        className="mt-2 inline-flex min-h-[2.25rem] items-center rounded-full border border-white/15 px-3 text-xs font-semibold text-[var(--cs-text)] hover:border-amber-400/50"
        onClick={regenerateLast}
      >
        Tekrar dene
      </button>
    );
  }

  if (isParitySor) {
    return (
      <>
        <div className={cn("cp-sor-view", examChrome && "cp-exam-chat")}>
          {showParityThread && !examChrome ? (
            <div className="cp-thread-bar">
              <button type="button" onClick={resetParityThread}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Geri
              </button>
              <button type="button" onClick={resetParityThread}>
                Yeni sohbet
              </button>
            </div>
          ) : null}
          {showParityEmpty && examChrome ? (
            <div className="cp-exam-empty">
              <div className="cp-exam-column">
                <div className="cp-exam-greet">
                  <span className="cp-exam-mark" aria-hidden>
                    <CortexMark size={14} />
                  </span>
                  <p>{greetingLine ?? "Selam! Neye çalışmak istersin?"}</p>
                </div>
                {starterPrompts?.length ? (
                  <div className="cp-exam-starters" role="group" aria-label="Başlangıç önerileri">
                    {starterPrompts.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="cp-exam-starter"
                        disabled={loading}
                        onClick={() => void send(item.prompt)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {showParityEmpty && !examChrome ? (
            <div className="cp-sor-hero">
              <h1 className="cp-sor-hero-title">
                {greetingLine ?? "Merhaba!"}
              </h1>
              {greetingSubline ? (
                <p className="cp-sor-hero-sub">{greetingSubline}</p>
              ) : null}
              <button
                type="button"
                className="cp-sor-start"
                disabled={loading}
                onClick={() => {
                  if (startPrompt) {
                    void send(startPrompt);
                    return;
                  }
                  setStartHubOpen(true);
                }}
              >
                {startPrompt ? startLabel : "+ " + startLabel}
              </button>

              {/* Boş ekranda "ne sorabilirim" sorusunun cevabı. Öneriler
                  kayıt cevaplarından üretiliyor; basınca doğrudan soruyor. */}
              {starterPrompts?.length ? (
                <div className="cp-sor-starters" role="group" aria-label="Başlangıç önerileri">
                  {starterPrompts.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="cp-sor-starter"
                      disabled={loading}
                      onClick={() => void send(item.prompt)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Günün turu yalnızca defterde bekleyen soru varsa görünüyor.
                  Boşken göstermek, basınca "soru yok" diyen bir düğme
                  demekti. */}
              {dailyDrillCount ? (
                <Link href="/gunluk" className="cp-sor-daily">
                  <span className="cp-sor-daily-title">Günün turu</span>
                  <span className="cp-sor-daily-sub">
                    Defterinden {dailyDrillCount} soru bekliyor · beş dakika
                  </span>
                </Link>
              ) : null}
            </div>
          ) : null}

          {showParityThread ? (
            <div
              ref={messagesScrollRef}
              className={cn("cp-sor-messages", examChrome && "cp-exam-thread")}
              aria-live="polite"
            >
              <div className={examChrome ? "cp-exam-column" : undefined}>
              {messages.map((message, index) => {
                const assistantBody = message.content ? (
                  <>
                    {message.isError ? (
                      <div role="alert">
                        <TutorReplyView
                          content={message.content}
                          variant="parity"
                          disabled
                          onPrompt={() => undefined}
                        />
                        {renderRetry(index)}
                      </div>
                    ) : (
                      <>
                        <TutorReplyView
                          content={message.content}
                          variant="parity"
                          disabled={loading}
                          onPrompt={(prompt) => void send(prompt)}
                        />
                        <MessageActions
                          content={message.content}
                          messageId={feedbackEnabled ? message.id : undefined}
                          rating={message.rating ?? null}
                          onRated={(next) => setRating(index, next)}
                          onRegenerate={
                            index === messages.length - 1 && !loading
                              ? regenerateLast
                              : undefined
                          }
                        />
                      </>
                    )}
                  </>
                ) : loading && examChrome ? (
                  <SorTypingDots label={thinkingLabel} />
                ) : null;

                if (examChrome) {
                  if (message.role === "user") {
                    return (
                      <div key={index} className="cp-exam-user">
                        <div className="cp-exam-user-bubble">{message.content}</div>
                      </div>
                    );
                  }
                  if (!assistantBody) return null;
                  return (
                    <div key={index} className="cp-exam-assistant">
                      <span className="cp-exam-mark" aria-hidden>
                        <CortexMark size={14} />
                      </span>
                      <div className="cp-exam-msg-body">{assistantBody}</div>
                    </div>
                  );
                }

                return (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "cp-sor-msg-user"
                      : "cp-sor-msg-assistant"
                  }
                >
                  {message.role === "user" ? (
                    message.content
                  ) : (
                    assistantBody
                  )}
                </div>
                );
              })}
              </div>

              {/* Yanıt bittikten sonra devam önerileri. Öğrenci "peki şimdi ne
                  sorayım" diye kalmasın; bunlar gerçekten çalışan komutlar,
                  süs değil. Sınav sohbetinde aynı işi hızlı komutlar görür. */}
              {!examChrome && !loading && lastIsAnswer ? (
                <div className="cp-followups" role="group" aria-label="Devam önerileri">
                  {FOLLOW_UPS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="cp-followup"
                      onClick={() => void send(item.prompt)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {examChrome && loading && messages[messages.length - 1]?.role === "user" ? (
                <div className="cp-exam-column">
                  <div className="cp-exam-assistant">
                    <span className="cp-exam-mark" aria-hidden>
                      <CortexMark size={14} />
                    </span>
                    <div className="cp-exam-msg-body">
                      <SorTypingDots label={thinkingLabel} />
                    </div>
                  </div>
                </div>
              ) : null}
              {!examChrome && loading &&
              (messages.length === 0 ||
                messages[messages.length - 1]?.role === "user" ||
                messages[messages.length - 1]?.content === "") ? (
                <div className="cp-sor-msg-assistant">
                  <SorTypingDots label={thinkingLabel} />
                </div>
              ) : null}
              {showUpgrade && messages.length > 0 ? (
                <Link href="/pay" className="cp-upgrade-banner">
                  Daha hızlı öğrenmek için yükselt
                </Link>
              ) : null}
              <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
            </div>
          ) : null}

          {examChrome && quickOpen ? (
            <button
              type="button"
              className="cp-exam-dim"
              aria-label="Hızlı komutları kapat"
              onClick={() => setQuickOpen(false)}
            />
          ) : null}

          {/* Ücretsiz kullanıcıda yazı alanının yanına kalıcı bir yükseltme
              kartı giriyor. Kutunun içine değil yanına: yazacak yeri
              daraltmadan her açılışta görünüyor. Sınav sohbetinde satış
              kartı yok; kota dolunca mevcut kredi kapısı açılır. */}
          <div
            className={cn(
              "cp-sor-composer-zone",
              showUpgrade && "cp-sor-composer-zone--aside",
            )}
            style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
          >
            <div className="cp-sor-composer-main">
            {renderSourceMode(true)}
            {showSubjectPicker ? (
              <div className="cp-sor-subject-wrap">
                <button
                  type="button"
                  className="cp-sor-subject"
                  aria-expanded={subjectOpen}
                  onClick={() => setSubjectOpen(true)}
                >
                  {subject}
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
                </button>
              </div>
            ) : null}

            {examChrome ? (
              <div className="cp-exam-quick-wrap">
                {quickOpen ? (
                  <div className="cp-exam-quick" role="group" aria-label="Hızlı komutlar">
                    {EXAM_QUICK_COMMANDS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="cp-exam-quick-chip"
                        disabled={loading}
                        onClick={() => {
                          setQuickOpen(false);
                          void send(item.prompt);
                        }}
                      >
                        <span>{item.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={cn("cp-exam-more-pill", quickOpen && "is-open")}
                  aria-expanded={quickOpen}
                  onClick={() => setQuickOpen((open) => !open)}
                >
                  {quickOpen ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <EllipsisVertical className="h-4 w-4" aria-hidden />
                  )}
                  Daha fazla
                </button>
              </div>
            ) : null}

            <form
              className="cp-sor-composer-box"
              onSubmit={(event) => {
                event.preventDefault();
                void sendComposer();
              }}
            >
              {pendingFile || pendingRemote ? (
                <div className="cp-composer-preview">
                  {pendingPreview ? (
                    <div className="cp-composer-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pendingPreview} alt="" />
                      <button type="button" aria-label="Kaldır" onClick={clearPending}>
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="cp-composer-file">
                      {pendingFile?.name ?? pendingRemote?.fileName}
                      <button type="button" aria-label="Kaldır" onClick={clearPending}>
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
              {mathOpen ? (
                <MathKeyboard
                  onInsert={insertMath}
                  onBackspace={backspaceComposer}
                  onMoveCaret={moveComposerCaret}
                  onClose={() => setMathOpen(false)}
                />
              ) : null}
              <Textarea
                ref={composerRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={placeholder ?? "Sor, konuş veya dosya gönder"}
                rows={2}
                aria-label="Mesajın"
                disabled={loading}
                className="min-h-[3.25rem] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendComposer();
                  }
                }}
              />
              <div className="cp-sor-composer-toolbar">
                <div className="cp-sor-composer-tools relative">
                  <button
                    type="button"
                    className="cp-sor-tool"
                    aria-label="Görsel ekle"
                    disabled={loading}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        openComposerDialog("image_upload");
                      } else {
                        setUploadOpen(true);
                      }
                    }}
                  >
                    <ImageIcon className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="cp-sor-tool"
                    aria-label="Çizim tahtası"
                    disabled={loading}
                    onClick={() => openComposerDialog("sketch")}
                  >
                    {examChrome ? (
                      <DrawSquiggle className="h-4 w-4" />
                    ) : (
                      <Brush className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  {examChrome ? null : (
                  <button
                    type="button"
                    className={cn("cp-sor-tool", mathOpen && "text-[var(--cp-subject)]")}
                    aria-label="Matematik simgeleri"
                    aria-pressed={mathOpen}
                    disabled={loading}
                    onClick={() => {
                      setComposerAssistOpen(false);
                      setMathOpen((open) => !open);
                    }}
                  >
                    <PenLine className="h-4 w-4" aria-hidden />
                  </button>
                  )}
                  <button
                    type="button"
                    className={cn(
                      "cp-sor-tool",
                      composerAssistOpen && "text-[var(--cp-subject)]",
                    )}
                    aria-label={examChrome ? "Araçlar" : "Mod seç"}
                    aria-expanded={composerAssistOpen}
                    disabled={loading}
                    onClick={() => {
                      setMathOpen(false);
                      setComposerAssistOpen((open) => !open);
                    }}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </button>
                  {composerAssistOpen ? (
                    <div className="cp-composer-mode-menu" role="menu">
                      {COMPOSER_MODES.map((mode) => {
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            role="menuitem"
                            className={cn(
                              "cp-composer-mode-item",
                              composerAssist === mode.id && "cp-composer-mode-item--active",
                            )}
                            onClick={() => {
                              setComposerAssist(mode.id);
                              setComposerAssistOpen(false);
                            }}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>
                              <strong className="block text-sm">{mode.label}</strong>
                              <span className="text-xs text-[var(--cp-muted)]">{mode.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                      {examChrome ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="cp-composer-mode-item"
                          onClick={() => {
                            setComposerAssistOpen(false);
                            setMathOpen(true);
                          }}
                        >
                          <PenLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>
                            <strong className="block text-sm">Matematik</strong>
                            <span className="text-xs text-[var(--cp-muted)]">Simge klavyesi</span>
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {examChrome ? (
                    <button
                      type="button"
                      className="cp-sor-tool"
                      aria-label="Ayarlar"
                      onClick={() => openComposerDialog("profile")}
                    >
                      <SlidersHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                  <Link
                    href="/ogretmen?dialog=profile"
                    className="cp-sor-tool"
                    aria-label="Ayarlar"
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  </Link>
                  )}
                </div>
                <div className="cp-sor-composer-voice">
                  <button
                    type="button"
                    className={cn(
                      "cp-sor-tool",
                      examChrome && "cp-exam-mic",
                      listening && "text-[var(--cp-subject)]",
                    )}
                    aria-label={
                      listening
                        ? "Kaydı bitir"
                        : transcribing
                          ? "Sesin çözümleniyor"
                          : "Mikrofon"
                    }
                    disabled={loading || transcribing}
                    onClick={startVoiceInput}
                  >
                    <Mic className="h-4 w-4" aria-hidden />
                  </button>
                  {showExamTalk ? (
                    <button
                      type="button"
                      className="cp-exam-talk"
                      disabled={(loading || transcribing || !canTalk) && !talking}
                      onClick={talkLastAnswer}
                    >
                      {talking ? "Durdur" : "Konuş"}
                      <AudioLines className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                  {showExamSend && !founder && chatCreditCost != null && chatCreditCost > 0 ? (
                    <span className="cp-exam-credit">{chatCreditCost} kr</span>
                  ) : null}
                  {showExamSend ? (
                    <button
                      type="submit"
                      className="cp-send"
                      aria-label={
                        loading
                          ? "Yanıt hazırlanıyor"
                          : !founder && chatCreditCost != null && chatCreditCost > 0
                            ? `Gönder, ${chatCreditCost} kr`
                            : "Gönder"
                      }
                      disabled={loading || !hasComposerPayload}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  ) : null}
                  {!examChrome && loading ? (
                    /* Üretim sürerken gönder düğmesinin yerini durdur alıyor:
                       yarım kalan yanıt ekranda kalır, kredi bir kez düşer. */
                    <button
                      type="button"
                      className="cp-send"
                      aria-label="Yanıtı durdur"
                      onClick={stopGeneration}
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : !examChrome && (input.trim() || pendingFile || pendingRemote) ? (
                    <button
                      type="submit"
                      className="cp-send"
                      aria-label="Gönder"
                    >
                      <Send className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                  {!examChrome && !loading && !(input.trim() || pendingFile || pendingRemote) ? (
                    <button
                      type="button"
                      className="cp-sor-voice-chip"
                      disabled={loading}
                      onClick={startVoiceInput}
                    >
                      Cortex Plus ile konuş
                      <AudioLines className="h-3.5 w-3.5 opacity-80" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            </form>
            </div>

            {showUpgrade ? (
              <div
                className={cn(
                  "cp-sor-composer-upgrade",
                  showParityEmpty && "cp-sor-composer-upgrade--empty-deferred",
                )}
              >
                <UpgradeAside returnPath={returnPath} />
              </div>
            ) : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            attachPending(file);
          }}
        />

        <StartHub
          open={startHubOpen}
          onClose={() => setStartHubOpen(false)}
          onScanProblem={() => {
            setStartHubOpen(false);
            setUploadOpen(true);
          }}
        />
        <UploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onPick={attachPending}
          onRemote={attachRemote}
        />
        <SubjectModal
          open={subjectOpen}
          value={subject}
          onClose={() => setSubjectOpen(false)}
          onSelect={setSubject}
        />

        <CreditGate
          open={paywall}
          onOpenChange={setPaywall}
          message="Bu işlem için yeterli kredin veya ücretsiz hakkın kalmadı. Çalışman kayıtlı kalır."
          returnPath={returnPath}
          isPremium={isPremium}
        />
      </>
    );
  }

  function bubbleClass(message: Message, index?: number) {
    if (message.role === "user") {
      return userBubbleClass();
    }
    const streaming =
      isMinimalSor &&
      loading &&
      index != null &&
      index === messages.length - 1 &&
      message.content.length > 0;
    return cn(
      "mr-auto max-w-[92%] rounded-2xl px-3 py-2 text-sm",
      isParity
        ? cn(
            "cs-sor-bubble--assistant cs-sor-bubble-enter",
            message.isError && "cs-sor-bubble--error",
            streaming && "cs-sor-bubble--streaming",
          )
        : "rounded-lg border",
    );
  }

  function userBubbleClass() {
    return cn(
      "ml-auto max-w-[85%] rounded-2xl px-3 py-2 text-sm font-medium",
      isParity
        ? "cs-sor-bubble--user cs-sor-bubble-enter"
        : "rounded-lg bg-primary text-primary-foreground",
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-4",
          isParity && "flex-1 pb-4",
          isMinimalSor && "cs-sor-view cs-sor-view--shell gap-0 pb-0",
        )}
      >
        {!isParity ? (
          <div className="flex flex-wrap gap-2">
            {quickActions.filter((action) => action.advanced !== true || allowAdvanced).map((action) => (
              <Button
                key={action.id}
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => send(action.prompt, action.advanced)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {hasDocuments && !isParity ? (
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={useDocuments}
                onCheckedChange={(value) => setUseDocuments(value === true)}
              />
              Yüklediğim dokümanları kaynak olarak kullan
            </label>
            {useDocuments ? (
              <fieldset className="ml-6 flex flex-wrap gap-3 text-xs text-[var(--cs-muted)]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="doc-mode"
                    checked={documentsOnly}
                    onChange={() => setDocumentsOnly(true)}
                  />
                  Yalnızca belgem
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="doc-mode"
                    checked={!documentsOnly}
                    onChange={() => setDocumentsOnly(false)}
                  />
                  Belgem + genel bilgi
                </label>
              </fieldset>
            ) : null}
          </div>
        ) : null}

        {isParity ? renderSourceMode() : null}

        {isParity && !isMinimalSor && messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <p className="text-lg font-semibold tracking-tight">
              {greetingLine ?? "Merhaba, bugün ne çalışalım?"}
            </p>
            {greetingSubline ? (
              <p className="max-w-xs text-sm text-[var(--cs-muted)]">{greetingSubline}</p>
            ) : null}
            {showEmptyStarter ? (
              <>
                <Button
                  type="button"
                  className="cs-btn-primary rounded-full px-8"
                  disabled={loading}
                  onClick={() =>
                    send(
                      startPrompt ??
                        "Bugün hangi konuda çalışmak istiyorsun? Bana kısaca anlat.",
                    )
                  }
                >
                  {startLabel}
                </Button>
                {starterPrompts?.length ? (
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {starterPrompts.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        disabled={loading}
                        className="rounded-full border border-[var(--cs-border)] px-3 py-1.5 text-xs text-[var(--cs-muted)] hover:border-[var(--cs-primary)] hover:text-white"
                        onClick={() => send(item.prompt)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {isMinimalSor ? (
          <div className="cs-sor-main">
            <div
              className={cn(
                "cs-sor-empty-layer",
                !showMinimalEmpty && "cs-sor-empty-layer--hidden",
              )}
              aria-hidden={!showMinimalEmpty}
            >
              <div className="cs-sor-greeting-block">
                <p className="cs-sor-greeting">
                  {greetingLine ?? "Merhaba, bugün ne çalışalım?"}
                </p>
                {greetingSubline ? (
                  <p className="cs-sor-greeting-sub">{greetingSubline}</p>
                ) : null}
              </div>
            </div>

            {showMinimalMessages ? (
              <div
                ref={messagesScrollRef}
                className="cs-sor-messages min-h-0 flex-1 space-y-3"
                aria-live="polite"
              >
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={bubbleClass(message, index)}
                    role={message.isError ? "alert" : undefined}
                  >
                    {message.role === "user" ? (
                      message.content
                    ) : message.content ? (
                      <TutorReplyView
                        content={message.content}
                        variant="parity"
                        disabled={loading}
                        onPrompt={(prompt) => void send(prompt)}
                      />
                    ) : null}
                  </div>
                ))}
                {loading &&
                (messages.length === 0 ||
                  messages[messages.length - 1]?.role === "user" ||
                  messages[messages.length - 1]?.content === "") ? (
                  <div
                    className={cn(
                      "mr-auto max-w-[92%] rounded-2xl px-3 py-2.5",
                      "cs-sor-bubble--assistant cs-sor-bubble--thinking cs-sor-bubble-enter",
                    )}
                  >
                    <SorTypingDots label={thinkingLabel} />
                  </div>
                ) : null}
                <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
              </div>
            ) : null}
          </div>
        ) : null}

        {!isMinimalSor ? (
        <div
          className={cn(
            isParity
              ? cn(
                  "min-h-[120px] flex-1 space-y-3 overflow-y-auto py-2",
                  isMinimalSor && "cs-sor-messages min-h-0 py-0",
                )
              : "min-h-[280px] space-y-3 rounded-lg border p-3",
          )}
          aria-live="polite"
        >
          {!isParity && messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bir soru yaz ya da yukarıdaki hızlı eylemlerden birini seç.
            </p>
          ) : null}
          {messages.map((message, index) => (
            <div key={index} className={bubbleClass(message)}>
              {message.role === "user" ? (
                message.content
              ) : (
                <TutorReplyView
                  content={message.content}
                  variant={isParity ? "parity" : "default"}
                  disabled={loading}
                  onPrompt={(prompt) => void send(prompt)}
                />
              )}
            </div>
          ))}
          {loading && !isParity ? (
            <p className="text-xs text-muted-foreground">{thinkingLabel}</p>
          ) : null}
          {loading && isParity && !isMinimalSor ? (
            <p className="text-xs text-[var(--cs-muted)]">{thinkingLabel}</p>
          ) : null}
        </div>
        ) : null}

        {status && !isParity ? (
          <Badge variant="secondary" className="w-fit">
            {status}
          </Badge>
        ) : null}

        {isParity ? (
          isMinimalSor ? (
            <div className="cs-sor-dock">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  await handleAttachmentFile(file);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  await handleAttachmentFile(file);
                }}
              />
              <form
                className="cs-sor-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (input.trim()) send(input);
                }}
              >
                {showAttachments ? (
                  <div className="cs-sor-attach-wrap">
                    {attachMenuOpen ? (
                      <div className="cs-sor-attach-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => cameraInputRef.current?.click()}
                        >
                          <Camera className="h-4 w-4 shrink-0" aria-hidden />
                          Fotoğraf çek
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
                          Dosya ekle
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAttachMenuOpen(false);
                            startVoiceInput();
                          }}
                        >
                          <Mic className="h-4 w-4 shrink-0" aria-hidden />
                          {listening ? "Dinliyorum — bitir" : "Sesle sor"}
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="cs-sor-attach"
                      aria-label="Ekle"
                      aria-expanded={attachMenuOpen}
                      aria-haspopup="menu"
                      onClick={() => setAttachMenuOpen((open) => !open)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={placeholder ?? "Sorunu yaz…"}
                  rows={1}
                  aria-label="Mesajın"
                  disabled={loading}
                  className="min-h-[44px] flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (input.trim()) send(input);
                    }
                  }}
                />
                {loading ? (
                  <button
                    type="button"
                    className="cs-sor-send"
                    aria-label="Durdur"
                    onClick={stopGeneration}
                  >
                    ■
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="cs-sor-send"
                    aria-label="Gönder"
                  >
                    ↑
                  </button>
                )}
              </form>
            </div>
          ) : (
          <div className="sticky bottom-0 space-y-2 pb-1">
            {founder ? null : quotaHint ? (
              <p className="text-center text-[11px] text-[var(--cs-muted)]">
                {quotaHint}
              </p>
            ) : chatCreditCost != null ? (
              <p className="text-center text-[11px] text-[var(--cs-muted)]">
                Her mesaj yaklaşık {chatCreditCost} kredi harcar.
                {allowAdvanced ? " Sigma ile gelişmiş model kullanılır." : ""}
                {tutorStyleLabel ? ` · Stil: ${tutorStyleLabel}` : ""}
              </p>
            ) : null}
            <div
              className={cn(
                "relative flex justify-center",
                !showSubjectPicker && "hidden",
              )}
            >
              <button
                type="button"
                className="rounded-full border border-[var(--cs-border)] bg-[var(--cs-pill)] px-4 py-1.5 text-sm"
                onClick={() => setSubjectOpen((v) => !v)}
                aria-expanded={subjectOpen}
              >
                {subject}
              </button>
              {subjectOpen ? (
                <ul className="absolute bottom-full z-10 mb-2 max-h-48 w-48 overflow-auto rounded-2xl border border-[var(--cs-border)] bg-[var(--cs-surface)] py-1 text-sm shadow-lg">
                  {SUBJECTS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className="block w-full px-4 py-2 text-left hover:bg-[var(--cs-pill)]"
                        onClick={() => {
                          setSubject(s);
                          setSubjectOpen(false);
                        }}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setLoading(true);
                try {
                  const docId = await uploadAttachment(file);
                  const prompt =
                    file.type.startsWith("image/")
                      ? "Bu görseldeki soruyu veya konuyu adım adım çöz ve açıkla."
                      : "Yüklediğim dosyayı özetle ve sorularımı yanıtlamaya hazır ol.";
                  await send(prompt, false, docId ?? undefined);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Dosya gönderilemedi.",
                  );
                  setLoading(false);
                }
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setLoading(true);
                try {
                  const docId = await uploadAttachment(file);
                  await send(
                    "Fotoğraftaki soruyu adım adım çöz.",
                    false,
                    docId ?? undefined,
                  );
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Fotoğraf gönderilemedi.",
                  );
                  setLoading(false);
                }
              }}
            />
            <form
              className="cs-composer flex items-end gap-2 p-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (input.trim()) send(input);
              }}
            >
              {showAttachments ? (
                <>
                  <button
                    type="button"
                    className="rounded-full p-2 text-[var(--cs-muted)]"
                    aria-label="Dosya ekle"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="cs-btn-primary flex rounded-full p-2"
                    aria-label="Kamera"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                </>
              ) : null}
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={placeholder ?? "Sor, konuş veya dosya gönder"}
                rows={1}
                aria-label="Mesajın"
                className="min-h-[44px] flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                className={cn(
                  "rounded-full p-2",
                  listening
                    ? "text-[var(--cs-primary)]"
                    : "text-[var(--cs-muted)]",
                )}
                aria-label={listening ? "Kaydı bitir" : "Mikrofon"}
                disabled={transcribing}
                onClick={startVoiceInput}
              >
                <Mic className="h-5 w-5" />
              </button>
              <Button
                type="submit"
                disabled={loading || !input.trim()}
                className="cs-btn-primary shrink-0 rounded-full px-4"
              >
                {loading ? "…" : "Konuş"}
              </Button>
            </form>
          </div>
          )
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Sorunu yaz…"
              rows={3}
              aria-label="Mesajın"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              Gönder
            </Button>
            {loading ? (
              <Button type="button" variant="outline" onClick={stopGeneration}>
                Durdur
              </Button>
            ) : null}
          </form>
        )}
      </div>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu işlem için yeterli kredin veya ücretsiz hakkın kalmadı. Çalışman kayıtlı kalır."
        returnPath={returnPath}
        isPremium={isPremium}
      />
    </>
  );
}

/**
 * Geçmiş satırı aynı sayfada `?sohbet=` değiştirir. Sunucu yeni mesajları
 * gönderir; state yalnızca ilk kurulurken okunursa adres çubuğu ile ekran
 * ayrışır. Konuşma kimliği değişince oturum baştan kurulur.
 */
export function ChatPanel(props: ComponentProps<typeof ChatPanelSession>) {
  return <ChatPanelSession key={props.initialConversationId ?? "new"} {...props} />;
}
