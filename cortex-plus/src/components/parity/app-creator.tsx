"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * Mini uygulama üreteci — sohbet biçiminde.
 *
 * Astra'da da akış aynı: fikri anlat, ürettirsin; emin değilsen konuyu söyle,
 * önce birkaç seçenek önersin.
 */

type Idea = { title: string; detail: string };

export function AppCreator({ creditCost }: { creditCost: number | null }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [topic, setTopic] = useState("");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [busy, setBusy] = useState<null | "ideas" | "build">(null);

  async function suggest() {
    if (topic.trim().length < 2 || busy) return;
    setBusy("ideas");
    try {
      const res = await fetch("/api/lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ideas", topic: topic.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIdeas(Array.isArray(data.ideas) ? data.ideas : []);
    } catch {
      toast.error("Öneriler alınamadı. Tekrar dener misin?");
    } finally {
      setBusy(null);
    }
  }

  async function build() {
    const text = prompt.trim();
    if (text.length < 10 || busy) return;
    setBusy("build");
    try {
      const res = await fetch("/api/lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "build", prompt: text }),
      });

      if (res.status === 402) {
        toast.error("Kullanım hakkın yetmiyor.");
        return;
      }
      if (!res.ok) {
        // "Üretilen şey çalışmıyordu" ile "bağlantı koptu" farklı şeyler;
        // kullanıcı hangisi olduğunu bilirse ne yapacağını da bilir.
        const body = await res.json().catch(() => null);
        toast.error(
          body?.error === "generation_unusable"
            ? "Üretilen uygulama çalışmadı. Fikrini biraz daha ayrıntılı anlatır mısın?"
            : "Uygulama üretilemedi. Tekrar dener misin?",
        );
        return;
      }

      const data = await res.json();
      router.push(`/uygulamalar/benim/${data.id}`);
    } catch {
      toast.error("Bağlantı kurulamadı.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ap-creator">
      <header className="ap-creator-head">
        <Sparkles className="h-5 w-5 text-[var(--ap-gold)]" aria-hidden />
        <div>
          <h1>Uygulama oluştur</h1>
          <p>
            Fikrini anlat, paylaşabileceğin küçük ve etkileşimli bir uygulamaya
            çevirelim: simülasyon, mini oyun, görselleştirme ya da bulmaca.
            Ne kadar ayrıntılı anlatırsan ilk sürüm o kadar iyi olur.
          </p>
        </div>
      </header>

      <label className="ap-creator-label" htmlFor="app-prompt">
        Ne yapmasını istiyorsun?
      </label>
      <textarea
        id="app-prompt"
        className="ap-creator-input"
        rows={5}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Örnek: Eğik atış simülasyonu. Açı ve hız için kaydırıcı olsun, mermi yolunu çizsin, menzili yazsın."
      />

      <div className="ap-creator-actions">
        <button
          type="button"
          className="ap-creator-build"
          disabled={prompt.trim().length < 10 || busy !== null}
          onClick={build}
        >
          {busy === "build" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Uygulaman yazılıyor…
            </>
          ) : (
            "Uygulamayı oluştur"
          )}
        </button>
        {creditCost ? (
          <span className="ap-creator-cost">{creditCost} kullanım hakkı</span>
        ) : null}
      </div>

      <div className="ap-creator-ideas">
        <p className="ap-creator-label">Henüz emin değil misin?</p>
        <div className="ap-creator-topic">
          <input
            className="ap-creator-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Konuyu yaz: türev, mitoz, elektrik devreleri…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void suggest();
              }
            }}
          />
          <button
            type="button"
            className="ap-creator-suggest"
            disabled={topic.trim().length < 2 || busy !== null}
            onClick={suggest}
          >
            {busy === "ideas" ? "Düşünüyorum…" : "Fikir öner"}
          </button>
        </div>

        {ideas?.length ? (
          <ul className="ap-creator-idea-list">
            {ideas.map((idea, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setPrompt(`${idea.title}. ${idea.detail}`)}
                >
                  <strong>{idea.title}</strong>
                  <span>{idea.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : ideas ? (
          <p className="ap-creator-empty">Bu konu için öneri çıkmadı.</p>
        ) : null}
      </div>
    </div>
  );
}
