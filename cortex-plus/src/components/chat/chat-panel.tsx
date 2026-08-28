"use client";

import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";

import { Camera, Mic, Paperclip, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/astra-sor.css";

type Message = { role: "user" | "assistant"; content: string };

const quickActions = [
  { id: "hint", label: "İpucu ver", prompt: "Bana çözümü söylemeden bir ipucu ver." },
  { id: "simpler", label: "Daha basit anlat", prompt: "Aynı konuyu daha basit anlat." },
  { id: "steps", label: "Adım adım çöz", prompt: "Adım adım, her adımı gerekçelendirerek çöz." },
  { id: "similar", label: "Benzer örnek", prompt: "Aynı mantıkta benzer bir örnek soru üret ve çöz." },
  { id: "quiz", label: "Beni test et", prompt: "Bu konudan bana 3 soru sor ve yanıtlarımı bekle." },
  { id: "summary", label: "Kısa özet", prompt: "Konuşmanın kısa bir özetini çıkar." },
  { id: "advanced", label: "Gelişmiş analiz", prompt: "Bu konuyu ileri düzeyde ayrıntılı analiz et.", advanced: true },
];

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
  composerMode?: "full" | "minimal";
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
  const [subject, setSubject] = useState("Matematik");
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [listening, setListening] = useState(false);

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
  }, [initialMessages.length]);

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

  async function send(text: string, advanced = false, imageDocumentId?: string) {
    if (!text.trim() || loading) return;
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
      setStatus(
        `${res.headers.get("X-Model") ?? ""} · ${credits ?? "0"} kredi` +
          (sourceCount ? ` · ${sourceCount} kaynak` : ""),
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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Bir hata oluştu. Lütfen tekrar deneyin.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const isAstra = variant === "astra";
  const isMinimalSor = isAstra && composerMode === "minimal";

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-4",
          isAstra && "flex-1 pb-4",
          isMinimalSor && "astra-sor-view gap-0 pb-0",
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

        {isAstra && messages.length === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center text-center",
              isMinimalSor ? "astra-sor-empty" : "flex-1 gap-3 py-8",
            )}
          >
            <p className={isMinimalSor ? "astra-sor-greeting" : "text-lg font-semibold tracking-tight"}>
              {greetingLine ?? "Merhaba, bugün ne çalışalım?"}
            </p>
            {greetingSubline ? (
              <p className={isMinimalSor ? "astra-sor-greeting-sub" : "max-w-xs text-sm text-[var(--astra-muted)]"}>
                {greetingSubline}
              </p>
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

        {!(isMinimalSor && messages.length === 0) ? (
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
            <div
              key={index}
              className={
                message.role === "user"
                  ? isAstra
                    ? isMinimalSor
                      ? "ml-auto max-w-[85%] rounded-2xl bg-[var(--astra-primary)] px-3 py-2 text-sm font-medium text-[#0a0a0a]"
                      : "ml-auto max-w-[85%] rounded-2xl bg-[var(--astra-primary)] px-3 py-2 text-sm text-white"
                    : "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : isAstra
                    ? "mr-auto max-w-[92%] rounded-2xl border border-[var(--astra-border)] bg-[var(--astra-surface)] px-3 py-2 text-sm"
                    : "mr-auto max-w-[92%] rounded-lg border px-3 py-2"
              }
            >
              {message.role === "user" ? (
                message.content
              ) : (
                <Markdown content={message.content} />
              )}
            </div>
          ))}
          {loading ? (
            <p
              className={cn(
                "text-xs",
                isAstra ? "text-[var(--astra-muted)]" : "text-muted-foreground",
              )}
            >
              Yanıt hazırlanıyor…
            </p>
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
                accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setLoading(true);
                  try {
                    const docId = await uploadAttachment(file);
                    const prompt = file.type.startsWith("image/")
                      ? "Fotoğraftaki soruyu adım adım çöz."
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
              <form
                className="astra-sor-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (input.trim()) send(input);
                }}
              >
                {showAttachments ? (
                  <button
                    type="button"
                    className="astra-sor-attach"
                    aria-label="Dosya veya fotoğraf ekle"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                ) : null}
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={placeholder ?? "Sorunu yaz…"}
                  rows={1}
                  aria-label="Mesajın"
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
                  className="astra-sor-send"
                  aria-label="Gönder"
                >
                  ↑
                </button>
              </form>
              {chatCreditCost != null ? (
                <p className="astra-sor-meta">
                  ~{chatCreditCost} kredi / mesaj
                  {isPremium ? " · Plus model" : ""}
                </p>
              ) : null}
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
                aria-label="Mikrofon"
                onClick={() => {
                  type SpeechRecognitionCtor = new () => {
                    lang: string;
                    interimResults: boolean;
                    maxAlternatives: number;
                    onresult: ((event: {
                      results: { [index: number]: { [index: number]: { transcript?: string } } };
                    }) => void) | null;
                    onerror: (() => void) | null;
                    onend: (() => void) | null;
                    start: () => void;
                  };
                  const win = window as unknown as {
                    SpeechRecognition?: SpeechRecognitionCtor;
                    webkitSpeechRecognition?: SpeechRecognitionCtor;
                  };
                  const SpeechRecognition =
                    win.SpeechRecognition ?? win.webkitSpeechRecognition;
                  if (!SpeechRecognition) {
                    send(
                      "Bu mesajı sesli sohbet gibi yanıtla; kısa ve konuşma dilinde anlat.",
                    );
                    return;
                  }
                  const rec = new SpeechRecognition();
                  rec.lang = "tr-TR";
                  rec.interimResults = false;
                  rec.maxAlternatives = 1;
                  setListening(true);
                  rec.onresult = (event) => {
                    const transcript =
                      event.results[0]?.[0]?.transcript?.toString() ?? "";
                    if (transcript.trim()) setInput(transcript.trim());
                  };
                  rec.onerror = () => setListening(false);
                  rec.onend = () => setListening(false);
                  rec.start();
                }}
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

      <UpgradeSheet
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu işlem için yeterli kredin veya ücretsiz hakkın kalmadı. Çalışman kayıtlı kalır."
        returnPath={returnPath}
      />
    </>
  );
}
