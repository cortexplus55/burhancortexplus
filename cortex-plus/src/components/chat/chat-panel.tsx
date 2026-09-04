"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { CreditGate } from "@/components/paywall/credit-gate";

import {
  ArrowLeft,
  AudioLines,
  Camera,
  ChevronsUpDown,
  ImageIcon,
  LayoutGrid,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createRecognizer } from "@/lib/learning/studio-speech";
import {
  isRecordingSupported,
  mergeTranscript,
  startRecording,
  transcribe,
  type Recorder,
} from "@/lib/learning/voice-recorder";
import { subscribeComposerAttach } from "@/lib/student/composer-bridge";
import { AstraStartHub } from "@/components/parity/astra-start-hub";
import { AstraSubjectModal } from "@/components/parity/astra-subject-modal";
import { AstraUploadModal } from "@/components/parity/astra-upload-modal";
import { MathKeyboard } from "@/components/parity/math-keyboard";
import { UpgradeAside } from "@/components/paywall/upgrade-aside";
import "@/styles/astra-sor.css";
import "@/styles/astra-parity-sor.css";

type Message = { role: "user" | "assistant"; content: string; isError?: boolean };

function SorTypingDots() {
  return (
    <div className="astra-sor-typing" role="status" aria-label="Yanıt hazırlanıyor">
      <span />
      <span />
      <span />
    </div>
  );
}

function assistantErrorContent(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Bir hata oluştu. Lütfen tekrar deneyin.";
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

export function ChatPanel({
  initialConversationId,
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
}: {
  initialConversationId?: string;
  initialMessages?: Message[];
  hasDocuments: boolean;
  variant?: "default" | "astra";
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
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [useDocuments, setUseDocuments] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(initialConversationId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
  const [composerAssistOpen, setComposerAssistOpen] = useState(false);
  const [composerAssist, setComposerAssist] = useState<
    (typeof COMPOSER_MODES)[number]["id"] | null
  >(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(3);

  useEffect(() => {
    if (variant !== "astra") return;
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

  function openComposerDialog(dialog: "image_upload" | "sketch") {
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

  const isAstra = variant === "astra";
  const isMinimalSor = isAstra && composerMode === "minimal";
  const isParitySor = isAstra && composerMode === "parity";

  const sorChatActive = isMinimalSor && (messages.length > 0 || loading);

  useEffect(() => {
    if (!isMinimalSor) return;
    const root = document.querySelector(".astra-sor-screen--chat");
    if (!root) return;
    root.classList.toggle("astra-sor-screen--active-chat", sorChatActive);
    return () => root.classList.remove("astra-sor-screen--active-chat");
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
  // sekmesinde "kaydediyor" göstergesini yakılı bırakır.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, []);

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
    if (variant !== "astra") return;
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
    const prefixed =
      variant === "astra" && showSubjectPicker && subject
        ? `[${subject}] ${text.trim()}`
        : text.trim();
    setLoading(true);
    setStatus(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: prefixed }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prefixed,
          actionCode: advanced ? "AI_CHAT_ADVANCED" : "AI_CHAT_STANDARD",
          conversationId: conversationId.current,
          useDocuments,
          audience,
          imageDocumentId,
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
      const sourceLabel = sourceCount
        ? ` · notundan: ${sourceDoc || `${sourceCount} kaynak`}`
        : useDocuments
          ? " · genel bilgi"
          : "";
      setStatus(
        `${res.headers.get("X-Model") ?? ""} · ${credits ?? "0"} kredi${sourceLabel}`,
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        assistant += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistant };
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
      pushAssistantError(error);
    } finally {
      setLoading(false);
    }
  }

  const showMinimalEmpty = isMinimalSor && messages.length === 0 && !loading;
  const showMinimalMessages = isMinimalSor && (messages.length > 0 || loading);
  const showParityEmpty = isParitySor && messages.length === 0 && !loading;
  const showParityThread = isParitySor && (messages.length > 0 || loading);

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
    if (!isPremium) {
      toast.message("Sesle sormak için Plus gerekiyor", {
        description:
          "Bu tarayıcıda ses tanıma yok; sunucu çözümlemesi Plus planında.",
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

  if (isParitySor) {
    return (
      <>
        <div className="ap-sor-view">
          {showParityThread ? (
            <div className="ap-thread-bar">
              <button type="button" onClick={resetParityThread}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Geri
              </button>
              <button type="button" onClick={resetParityThread}>
                Yeni sohbet
              </button>
            </div>
          ) : null}
          {showParityEmpty ? (
            <div className="ap-sor-hero">
              <h1 className="ap-sor-hero-title">
                {greetingLine ?? "Merhaba!"}
              </h1>
              <button
                type="button"
                className="ap-sor-start"
                disabled={loading}
                onClick={() => setStartHubOpen(true)}
              >
                + {startLabel}
              </button>
            </div>
          ) : null}

          {showParityThread ? (
            <div
              ref={messagesScrollRef}
              className="ap-sor-messages"
              aria-live="polite"
            >
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "ap-sor-msg-user"
                      : "ap-sor-msg-assistant"
                  }
                >
                  {message.role === "user" ? (
                    message.content
                  ) : message.content ? (
                    <Markdown content={message.content} variant="astra" />
                  ) : null}
                </div>
              ))}
              {loading &&
              (messages.length === 0 ||
                messages[messages.length - 1]?.role === "user" ||
                messages[messages.length - 1]?.content === "") ? (
                <div className="ap-sor-msg-assistant">
                  <SorTypingDots />
                </div>
              ) : null}
              {!isPremium && messages.length > 0 ? (
                <Link href="/pay" className="ap-upgrade-banner">
                  Daha hızlı öğrenmek için yükselt
                </Link>
              ) : null}
              <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
            </div>
          ) : null}

          {/* Ücretsiz kullanıcıda yazı alanının yanına kalıcı bir yükseltme
              kartı giriyor. Kutunun içine değil yanına: yazacak yeri
              daraltmadan her açılışta görünüyor. */}
          <div
            className={cn(
              "ap-sor-composer-zone",
              !isPremium && "ap-sor-composer-zone--aside",
            )}
          >
            <div className="ap-sor-composer-main">
            {showSubjectPicker ? (
              <div className="ap-sor-subject-wrap">
                <button
                  type="button"
                  className="ap-sor-subject"
                  aria-expanded={subjectOpen}
                  onClick={() => setSubjectOpen(true)}
                >
                  {subject}
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
                </button>
              </div>
            ) : null}

            <form
              className="ap-sor-composer-box"
              onSubmit={(event) => {
                event.preventDefault();
                void sendComposer();
              }}
            >
              {pendingFile || pendingRemote ? (
                <div className="ap-composer-preview">
                  {pendingPreview ? (
                    <div className="ap-composer-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pendingPreview} alt="" />
                      <button type="button" aria-label="Kaldır" onClick={clearPending}>
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="ap-composer-file">
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
              <div className="ap-sor-composer-toolbar">
                <div className="ap-sor-composer-tools relative">
                  <button
                    type="button"
                    className="ap-sor-tool"
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
                    className="ap-sor-tool"
                    aria-label="Çizim tahtası"
                    disabled={loading}
                    onClick={() => openComposerDialog("sketch")}
                  >
                    <Brush className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={cn("ap-sor-tool", mathOpen && "text-[var(--ap-subject)]")}
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
                  <button
                    type="button"
                    className={cn(
                      "ap-sor-tool",
                      composerAssistOpen && "text-[var(--ap-subject)]",
                    )}
                    aria-label="Mod seç"
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
                    <div className="ap-composer-mode-menu" role="menu">
                      {COMPOSER_MODES.map((mode) => {
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            role="menuitem"
                            className={cn(
                              "ap-composer-mode-item",
                              composerAssist === mode.id && "ap-composer-mode-item--active",
                            )}
                            onClick={() => {
                              setComposerAssist(mode.id);
                              setComposerAssistOpen(false);
                            }}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>
                              <strong className="block text-sm">{mode.label}</strong>
                              <span className="text-xs text-[var(--ap-muted)]">{mode.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <Link
                    href="/ogretmen?dialog=profile"
                    className="ap-sor-tool"
                    aria-label="Ayarlar"
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
                <div className="ap-sor-composer-voice">
                  <button
                    type="button"
                    className={cn(
                      "ap-sor-tool",
                      listening && "text-[var(--ap-subject)]",
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
                  {input.trim() || pendingFile || pendingRemote ? (
                    <button
                      type="submit"
                      className="ap-send"
                      aria-label="Gönder"
                      disabled={loading}
                    >
                      <Send className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ap-sor-voice-chip"
                      disabled={loading}
                      onClick={startVoiceInput}
                    >
                      Cortex Plus ile konuş
                      <AudioLines className="h-3.5 w-3.5 opacity-80" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </form>
            </div>

            {!isPremium ? <UpgradeAside returnPath={returnPath} /> : null}
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

        <AstraStartHub
          open={startHubOpen}
          onClose={() => setStartHubOpen(false)}
          onScanProblem={() => {
            setStartHubOpen(false);
            setUploadOpen(true);
          }}
        />
        <AstraUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onPick={attachPending}
          onRemote={attachRemote}
        />
        <AstraSubjectModal
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
      isAstra
        ? cn(
            "astra-sor-bubble--assistant astra-sor-bubble-enter",
            message.isError && "astra-sor-bubble--error",
            streaming && "astra-sor-bubble--streaming",
          )
        : "rounded-lg border",
    );
  }

  function userBubbleClass() {
    return cn(
      "ml-auto max-w-[85%] rounded-2xl px-3 py-2 text-sm font-medium",
      isAstra
        ? "astra-sor-bubble--user astra-sor-bubble-enter"
        : "rounded-lg bg-primary text-primary-foreground",
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-4",
          isAstra && "flex-1 pb-4",
          isMinimalSor && "astra-sor-view astra-sor-view--shell gap-0 pb-0",
        )}
      >
        {!isAstra ? (
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
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

        {hasDocuments && !isAstra ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={useDocuments}
              onCheckedChange={(value) => setUseDocuments(value === true)}
            />
            Yüklediğim dokümanları kaynak olarak kullan
          </label>
        ) : null}

        {isAstra && !isMinimalSor && messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <p className="text-lg font-semibold tracking-tight">
              {greetingLine ?? "Merhaba, bugün ne çalışalım?"}
            </p>
            {greetingSubline ? (
              <p className="max-w-xs text-sm text-[var(--astra-muted)]">{greetingSubline}</p>
            ) : null}
            {showEmptyStarter ? (
              <>
                <Button
                  type="button"
                  className="astra-btn-primary rounded-full px-8"
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
                        className="rounded-full border border-[var(--astra-border)] px-3 py-1.5 text-xs text-[var(--astra-muted)] hover:border-[var(--astra-primary)] hover:text-white"
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
          <div className="astra-sor-main">
            <div
              className={cn(
                "astra-sor-empty-layer",
                !showMinimalEmpty && "astra-sor-empty-layer--hidden",
              )}
              aria-hidden={!showMinimalEmpty}
            >
              <div className="astra-sor-greeting-block">
                <p className="astra-sor-greeting">
                  {greetingLine ?? "Merhaba, bugün ne çalışalım?"}
                </p>
                {greetingSubline ? (
                  <p className="astra-sor-greeting-sub">{greetingSubline}</p>
                ) : null}
              </div>
            </div>

            {showMinimalMessages ? (
              <div
                ref={messagesScrollRef}
                className="astra-sor-messages min-h-0 flex-1 space-y-3"
                aria-live="polite"
              >
                {messages.map((message, index) => (
                  <div key={index} className={bubbleClass(message, index)}>
                    {message.role === "user" ? (
                      message.content
                    ) : message.content ? (
                      <Markdown content={message.content} variant="astra" />
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
                      "astra-sor-bubble--assistant astra-sor-bubble--thinking astra-sor-bubble-enter",
                    )}
                  >
                    <SorTypingDots />
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
            isAstra
              ? cn(
                  "min-h-[120px] flex-1 space-y-3 overflow-y-auto py-2",
                  isMinimalSor && "astra-sor-messages min-h-0 py-0",
                )
              : "min-h-[280px] space-y-3 rounded-lg border p-3",
          )}
          aria-live="polite"
        >
          {!isAstra && messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bir soru yaz ya da yukarıdaki hızlı eylemlerden birini seç.
            </p>
          ) : null}
          {messages.map((message, index) => (
            <div key={index} className={bubbleClass(message)}>
              {message.role === "user" ? (
                message.content
              ) : (
                <Markdown
                  content={message.content}
                  variant={isAstra ? "astra" : "default"}
                />
              )}
            </div>
          ))}
          {loading && !isAstra ? (
            <p className="text-xs text-muted-foreground">Yanıt hazırlanıyor…</p>
          ) : null}
          {loading && isAstra && !isMinimalSor ? (
            <p className="text-xs text-[var(--astra-muted)]">Yanıt hazırlanıyor…</p>
          ) : null}
        </div>
        ) : null}

        {status && !isAstra ? (
          <Badge variant="secondary" className="w-fit">
            {status}
          </Badge>
        ) : null}

        {isAstra ? (
          isMinimalSor ? (
            <div className="astra-sor-dock">
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
                className="astra-sor-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (input.trim()) send(input);
                }}
              >
                {showAttachments ? (
                  <div className="astra-sor-attach-wrap">
                    {attachMenuOpen ? (
                      <div className="astra-sor-attach-menu" role="menu">
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
                      className="astra-sor-attach"
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
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className={cn("astra-sor-send", loading && "astra-sor-send--loading")}
                  aria-label={loading ? "Gönderiliyor" : "Gönder"}
                >
                  ↑
                </button>
              </form>
            </div>
          ) : (
          <div className="sticky bottom-0 space-y-2 pb-1">
            {quotaHint ? (
              <p className="text-center text-[11px] text-[var(--astra-muted)]">
                {quotaHint}
              </p>
            ) : chatCreditCost != null ? (
              <p className="text-center text-[11px] text-[var(--astra-muted)]">
                Her mesaj yaklaşık {chatCreditCost} kredi harcar.
                {isPremium ? " Plus ile gelişmiş model kullanılır." : ""}
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
                className="rounded-full border border-[var(--astra-border)] bg-[var(--astra-pill)] px-4 py-1.5 text-sm"
                onClick={() => setSubjectOpen((v) => !v)}
                aria-expanded={subjectOpen}
              >
                {subject}
              </button>
              {subjectOpen ? (
                <ul className="absolute bottom-full z-10 mb-2 max-h-48 w-48 overflow-auto rounded-2xl border border-[var(--astra-border)] bg-[var(--astra-surface)] py-1 text-sm shadow-lg">
                  {SUBJECTS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className="block w-full px-4 py-2 text-left hover:bg-[var(--astra-pill)]"
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
              className="astra-composer flex items-end gap-2 p-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (input.trim()) send(input);
              }}
            >
              {showAttachments ? (
                <>
                  <button
                    type="button"
                    className="rounded-full p-2 text-[var(--astra-muted)]"
                    aria-label="Dosya ekle"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="astra-btn-primary flex rounded-full p-2"
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
                    ? "text-[var(--astra-primary)]"
                    : "text-[var(--astra-muted)]",
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
                className="astra-btn-primary shrink-0 rounded-full px-4"
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
