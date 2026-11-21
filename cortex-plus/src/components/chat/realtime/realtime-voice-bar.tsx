"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Mic, MicOff, Plus, RotateCcw, Square, X } from "lucide-react";
import { RealtimeBoardCard } from "@/components/chat/realtime/realtime-board-card";
import type { BoardCard } from "@/lib/tutor/realtime/config";
import type { TranscriptUpdate } from "@/lib/tutor/realtime/engine";
import {
  useRealtimeTutor,
  type RealtimeClientDeps,
  type RealtimeEndResult,
  type RealtimeTutorProblem,
  type RealtimeTutorStatus,
} from "@/lib/tutor/realtime/use-realtime-tutor";
import "@/styles/realtime-voice.css";

/*
  Canlı sesli öğretmen çubuğu (21 Kasım 2026). Sohbetin yazma alanının yerine oturur: öğrenci ekrandan ayrılmadan
  öğretmenle konuşur, söylenenler `onTranscript` ile sohbetin akışına canlı düşer, oturum bitince konuşma sunucuda sohbet
  geçmişine yazılır.

  Dışa açık arayüz (entegrasyon bunu kullanır):
    conversationId / prepId   konuşmanın bağlamı (sunucu sahipliği doğrular)
    onTranscript(turn)        { role, text, final, id }: aynı `id` için metin büyür; `final` true olunca kesinleşir. Boş
                              metinle gelen final satır (söz yazıya dökülemedi) akıştan kaldırılır.
    onBoardCard(card)         { id, kind: "formula" | "concept", title, body }: tahta kartı; akışa eklenir.
    onEnded(result)           { conversationId, seconds, reason }: çubuğun işi bitti, yazma alanı geri gelebilir. Normal
                              bitişte konuşma kaydedilince; hata ya da Plus davetinde öğrenci paneli kapatınca (davet
                              ekranda kalsın diye) çağrılır. Bir kez.
    onUpgrade()               "Plus'a geç"; verilmezse ödeme sayfasına gider.
  Kartları çubuk kendisi de çizer (`showBoard`, varsayılan: `onBoardCard` verilmemişse).
*/

export type RealtimeVoiceBarProps = {
  conversationId?: string | null;
  prepId?: string | null;
  onTranscript: (turn: TranscriptUpdate) => void;
  onEnded: (result: RealtimeEndResult) => void;
  onUpgrade?: () => void;
  onBoardCard?: (card: BoardCard) => void;
  showBoard?: boolean;
  /** Takılınca hemen bağlanır (varsayılan). */
  autoStart?: boolean;
  /** "bottom": ekranın altına yapışık (telefonda yazma alanının yerinde); varsayılan akışın içinde. */
  dock?: "inline" | "bottom";
  endpoint?: string;
  deps?: Partial<RealtimeClientDeps>;
  className?: string;
};

export const STATUS_TEXT: Record<Exclude<RealtimeTutorStatus, "error">, string> = {
  idle: "Sesli derse hazır",
  connecting: "Eğitmene bağlanılıyor...",
  listening: "Eğitmen dinliyor",
  thinking: "Eğitmen düşünüyor...",
  speaking: "Eğitmen konuşuyor...",
  ended: "Sesli ders bitti",
};

export const MUTED_TEXT = "Mikrofonun kapalı";
export const TRIAL_LABEL = "Ücretsiz deneme";
export const PLUS_INVITE_TITLE = "Canlı sesli öğretmen Plus'ta";
export const PLUS_INVITE_BODY = "Öğretmenle istediğin kadar konuş; söylediklerin sohbetine kaydedilir.";

const PAY_HREF = "/pay?plan=plus";
const LIMITS_HREF = "/krediler";

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type OrbMode = "idle" | "connecting" | "listening" | "thinking" | "speaking";

function VoiceOrb({ mode, readLevels }: { mode: OrbMode; readLevels: () => { input: number; output: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const readRef = useRef(readLevels);
  readRef.current = readLevels;
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      node.style.setProperty("--lvl", "0");
      return;
    }
    let frame = 0;
    let smooth = 0;
    const loop = () => {
      const levels = readRef.current();
      const target = mode === "speaking" ? levels.output : mode === "listening" ? levels.input : 0;
      smooth += (target - smooth) * (target > smooth ? 0.35 : 0.12);
      node.style.setProperty("--lvl", smooth.toFixed(3));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mode]);
  return (
    <div ref={ref} className="cx-rv-orb" data-mode={mode} aria-hidden="true">
      <span className="cx-rv-orb-halo" />
      <span className="cx-rv-orb-core" />
    </div>
  );
}

const PROBLEM_ACTION: Record<RealtimeTutorProblem, "plus" | "retry" | "limits"> = {
  plus: "plus",
  quota: "limits",
  mic_denied: "retry",
  mic_missing: "retry",
  network: "retry",
  max_duration: "retry",
  failed: "retry",
};

export function RealtimeVoiceBar(props: RealtimeVoiceBarProps) {
  const { onEnded, onUpgrade, autoStart = true, dock = "inline" } = props;
  const showBoard = props.showBoard ?? !props.onBoardCard;
  const reportedRef = useRef(false);
  const lastResultRef = useRef<RealtimeEndResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const report = (result: RealtimeEndResult) => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onEnded(result);
  };

  const tutor = useRealtimeTutor({
    conversationId: props.conversationId ?? null,
    prepId: props.prepId ?? null,
    endpoint: props.endpoint,
    deps: props.deps,
    onTranscript: props.onTranscript,
    onBoardCard: props.onBoardCard,
    onEnded: (result) => {
      lastResultRef.current = result;
      // Normal bitiş: çubuğun işi bitti. Hata ya da davet: öğrenci paneli kapatınca bildirilir.
      if (result.reason === "user" || result.reason === "replaced") report(result);
    },
  });

  // Kurulunca bağlanır. Geliştirme modunda React bileşeni kurup söküp yeniden kurar: söküm oturumu kapatır (kancanın
  // temizliği), yeniden kurulum yeniden başlatır; yarıda kalan ilk başlatma kendi sırasını bilip çekilir.
  useEffect(() => {
    if (!autoStart) return;
    void tutor.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const live = tutor.status === "listening" || tutor.status === "thinking" || tutor.status === "speaking";

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const sent = await tutor.sendImage(file);
    setNotice(sent ? null : "Görsel gönderilemedi. Daha küçük bir fotoğrafla yeniden dene.");
  };

  const close = () => {
    report(
      lastResultRef.current ?? {
        conversationId: props.conversationId ?? null,
        seconds: 0,
        reason: tutor.problem ?? "closed",
      },
    );
  };

  const restart = () => {
    reportedRef.current = false;
    lastResultRef.current = null;
    setNotice(null);
    void tutor.start();
  };

  const upgrade = () => {
    onUpgrade?.();
    close();
  };

  const orbMode: OrbMode = tutor.status === "error" || tutor.status === "ended" ? "idle" : tutor.status;
  const statusText =
    tutor.status === "error"
      ? (tutor.message ?? "")
      : tutor.muted && tutor.status === "listening"
        ? MUTED_TEXT
        : STATUS_TEXT[tutor.status];
  const clock =
    tutor.trialLeft != null ? `${TRIAL_LABEL} · ${formatClock(tutor.trialLeft)}` : live ? formatClock(tutor.elapsed) : null;

  const problem = tutor.status === "error" ? tutor.problem : null;
  const action = problem ? PROBLEM_ACTION[problem] : null;

  return (
    <section
      className={["cx-rv", props.className].filter(Boolean).join(" ")}
      data-dock={dock}
      data-status={tutor.status}
      aria-label="Canlı sesli ders"
    >
      {showBoard && tutor.cards.length ? (
        <div className="cx-rv-board" aria-label="Tahta">
          {tutor.cards.map((card) => (
            <RealtimeBoardCard key={card.id} card={card} />
          ))}
        </div>
      ) : null}

      <div className="cx-rv-panel">
        {problem === "plus" ? (
          <div className="cx-rv-invite" role="status">
            <p className="cx-rv-invite-title">{PLUS_INVITE_TITLE}</p>
            {tutor.message ? <p className="cx-rv-invite-body">{tutor.message}</p> : null}
            <p className="cx-rv-invite-body">{PLUS_INVITE_BODY}</p>
          </div>
        ) : (
          <div className="cx-rv-status" aria-live="polite">
            <span className="cx-rv-status-dot" aria-hidden="true" />
            <span className="cx-rv-status-text">{statusText}</span>
            {clock ? <span className="cx-rv-clock">{clock}</span> : null}
          </div>
        )}
        {notice ? (
          <p className="cx-rv-notice" role="alert">
            {notice}
          </p>
        ) : null}

        <div className="cx-rv-row">
          <VoiceOrb mode={orbMode} readLevels={tutor.readLevels} />

          {problem ? (
            <div className="cx-rv-actions">
              {action === "plus" ? (
                onUpgrade ? (
                  <button type="button" className="cx-rv-cta cx-brand" onClick={upgrade}>
                    Plus&apos;a geç
                  </button>
                ) : (
                  <Link href={PAY_HREF} className="cx-rv-cta cx-brand" onClick={close}>
                    Plus&apos;a geç
                  </Link>
                )
              ) : action === "limits" ? (
                <Link href={LIMITS_HREF} className="cx-rv-cta cx-glass" onClick={close}>
                  Kullanım limitleri
                </Link>
              ) : (
                <button type="button" className="cx-rv-cta cx-glass" onClick={restart}>
                  <RotateCcw aria-hidden="true" />
                  Yeniden dene
                </button>
              )}
              <button type="button" className="cx-rv-icon cx-weak" aria-label="Kapat" onClick={close}>
                <X aria-hidden="true" />
              </button>
            </div>
          ) : tutor.status === "ended" || tutor.status === "idle" ? (
            <div className="cx-rv-actions">
              <button type="button" className="cx-rv-cta cx-glass" onClick={restart}>
                <Mic aria-hidden="true" />
                {tutor.status === "idle" ? "Konuşmaya başla" : "Yeniden konuş"}
              </button>
            </div>
          ) : (
            <>
              <div className="cx-rv-tools">
                <button
                  type="button"
                  className="cx-rv-icon cx-glass"
                  aria-label="Görsel ekle"
                  disabled={!live}
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="cx-rv-icon cx-glass"
                  aria-label="Fotoğraf çek"
                  disabled={!live}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="cx-rv-icon cx-glass"
                  aria-label={tutor.muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
                  aria-pressed={tutor.muted}
                  data-muted={tutor.muted ? "true" : undefined}
                  disabled={!live}
                  onClick={tutor.toggleMute}
                >
                  {tutor.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
                </button>
              </div>
              <button type="button" className="cx-rv-stop" aria-label="Dersi bitir" onClick={tutor.stop}>
                <Square aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
    </section>
  );
}
