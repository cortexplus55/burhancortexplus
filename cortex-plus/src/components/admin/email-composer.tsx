"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  continueEmailCampaign,
  previewEmailCampaign,
  sendEmailTest,
  sendSingleEmail,
  startEmailCampaign,
  stopEmailCampaign,
} from "@/app/admin/eposta-actions";
import type { AudiencePreview, CampaignProgress } from "@/lib/email/campaign";

/*
  Yönetimden e-posta yazma ekranı (7 Kasım 2026). Üç tür:
  - Tek kişi: bir adrese, hesabı varsa adı ve sınava kalan günüyle.
  - Hizmet duyurusu: hesabı doğrulanmış herkese; yalnız hesapla ilgili bilgi (bakım, güvenlik, yasal değişiklik).
  - Kampanya: yalnız kampanya izni verenlere; kampanya anahtarı açıkken; her e-postada tek tıkla çıkış bağlantısı.

  Toplu gönderim önce önizlenir (kişi sayısı ve örnek), sonra kişi sayısı yazılarak onaylanır; gönderim turlar hâlinde
  ilerler ve istenirse durdurulur.
*/

type Mode = "single" | "service" | "marketing";

const MODE_COPY: Record<Mode, { label: string; hint: string }> = {
  single: { label: "Tek kişiye", hint: "Bir adrese yaz (destek cevabı gibi). Hesabı varsa adı ve sınava kalan günü kullanılır." },
  service: {
    label: "Hizmet duyurusu (herkese)",
    hint: "Hesabı doğrulanmış herkese gider. Yalnız hesapla ilgili bilgi için: bakım, güvenlik, yasal değişiklik. Kampanya ya da fırsat yazma.",
  },
  marketing: {
    label: "Kampanya (izin verenlere)",
    hint: "Yalnız duyuru ve kampanya e-postası almayı kabul edenlere gider; her e-postada tek tıkla çıkış bağlantısı olur.",
  },
};

const STOP_COPY: Record<string, string> = {
  kota: "Günlük gönderim kotası doldu. Kalan kişiler kuyrukta bekliyor; yarın «Devam et» ile sürdürebilir ya da e-posta planını yükseltebilirsin.",
  resend_yok: "E-posta altyapısı (Resend) yapılandırılmamış.",
  kuyruk_okunamadi: "Kuyruk okunamadı. Birkaç saniye sonra «Devam et»i dene.",
};

export function stopReasonText(reason: string | null): string | null {
  if (!reason) return null;
  if (STOP_COPY[reason]) return STOP_COPY[reason];
  return reason.startsWith("hata:") ? `Gönderim durdu (${reason.slice(5)}). Birkaç dakika sonra «Devam et»i dene.` : "Gönderim durdu.";
}

function formatCount(value: number): string {
  return value.toLocaleString("tr-TR");
}

export function EmailComposer({ campaignsOpen, resendReady }: { campaignsOpen: boolean; resendReady: boolean }) {
  const [mode, setMode] = useState<Mode>("single");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaPath, setCtaPath] = useState("");
  const [plan, setPlan] = useState<"all" | "free" | "paid">("all");
  const [signupDays, setSignupDays] = useState("");
  const [examDays, setExamDays] = useState("");

  const [preview, setPreview] = useState<{ data: AudiencePreview; warning: string | null; open: boolean } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const stopRef = useRef(false);

  const bulk = mode !== "single";

  function payload() {
    return {
      kind: mode === "marketing" ? "marketing" : "service",
      subject,
      body,
      ctaLabel,
      ctaPath,
      audience: {
        plan,
        signupDays: signupDays ? Number(signupDays) : null,
        examDays: examDays ? Number(examDays) : null,
      },
    };
  }

  function resetPreview() {
    setPreview(null);
    setConfirmText("");
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendEmailTest({ ...payload(), kind: mode === "marketing" ? "marketing" : "service" });
      if (result.ok) toast.success(`Deneme e-postası ${result.to} adresine gönderildi.`);
      else toast.error(result.error);
    });
  }

  function runPreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await previewEmailCampaign(payload());
      if (!result.ok) {
        setPreview(null);
        setMessage(result.error);
        return;
      }
      setPreview({ data: result.preview, warning: result.warning, open: result.marketingOpen });
      setConfirmText("");
    });
  }

  async function runLoop(id: string) {
    setBusy(true);
    stopRef.current = false;
    let stalled = 0;
    let last = -1;
    for (;;) {
      const result = await continueEmailCampaign(id);
      if (!result.ok) {
        setMessage(result.error);
        break;
      }
      setProgress(result.progress);
      if (result.progress.status !== "sending" || result.progress.stopReason || stopRef.current) break;
      const done = result.progress.sent + result.progress.failed + result.progress.skipped;
      stalled = done === last ? stalled + 1 : 0;
      last = done;
      if (stalled >= 3) {
        setMessage("Gönderim ilerlemiyor. Birkaç dakika sonra «Devam et»i dene.");
        break;
      }
    }
    setBusy(false);
  }

  async function startBulk() {
    if (!preview) return;
    setBusy(true);
    setMessage(null);
    const started = await startEmailCampaign(payload(), preview.data.count);
    if (!started.ok) {
      setBusy(false);
      setMessage(started.error);
      return;
    }
    setProgress({ id: started.id, status: "sending", total: started.total, sent: 0, failed: 0, skipped: 0, remaining: started.total, stopReason: null });
    await runLoop(started.id);
  }

  function submitSingle() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendSingleEmail({ to, subject, body, ctaLabel, ctaPath });
      if (result.ok) {
        toast.success(result.known ? "Gönderildi (hesabı olan bir öğrenciye)." : "Gönderildi.");
        setSubject("");
        setBody("");
      } else {
        setMessage(result.error);
      }
    });
  }

  const canConfirm = preview && confirmText.trim() === String(preview.data.count) && preview.open && resendReady;
  const finished = progress && progress.status !== "sending";

  return (
    <div className="grid gap-5">
      <div role="radiogroup" aria-label="Gönderim türü" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(MODE_COPY) as Mode[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => {
              setMode(key);
              resetPreview();
              setMessage(null);
            }}
            className={`adm-btn ${mode === key ? "adm-btn--primary" : ""}`}
          >
            {MODE_COPY[key].label}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--adm-muted)]">{MODE_COPY[mode].hint}</p>

      {mode === "marketing" && !campaignsOpen ? (
        <p role="alert" className="adm-note adm-note--warn">
          Kampanya e-postası şu an kapalı. İYS kaydını tamamlayınca Özellik Anahtarları sayfasındaki «Kampanya e-postası» anahtarını aç; o zamana kadar kampanya gönderilmez.
        </p>
      ) : null}

      {mode === "single" ? (
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Alıcının e-posta adresi
          <input value={to} onChange={(event) => setTo(event.target.value)} type="email" placeholder="ogrenci@ornek.com" className="adm-input" />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
            Paket
            <select
              value={plan}
              onChange={(event) => {
                setPlan(event.target.value as typeof plan);
                resetPreview();
              }}
              className="adm-input"
            >
              <option value="all">Hepsi</option>
              <option value="free">Yalnız ücretsiz</option>
              <option value="paid">Yalnız Plus</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
            Son kaç günde kayıt olanlar (boş: hepsi)
            <input
              value={signupDays}
              onChange={(event) => {
                setSignupDays(event.target.value.replace(/\D/g, "").slice(0, 4));
                resetPreview();
              }}
              inputMode="numeric"
              placeholder="ör. 7"
              className="adm-input"
            />
          </label>
          <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
            Sınavına en çok kaç gün kalanlar (boş: hepsi)
            <input
              value={examDays}
              onChange={(event) => {
                setExamDays(event.target.value.replace(/\D/g, "").slice(0, 3));
                resetPreview();
              }}
              inputMode="numeric"
              placeholder="ör. 30"
              className="adm-input"
            />
          </label>
        </div>
      )}

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Konu
        <input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            resetPreview();
          }}
          maxLength={120}
          placeholder="Sınavına {gün} gün kaldı, {ad}"
          className="adm-input"
        />
      </label>
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Mesaj — paragrafları boş satırla ayır. {"{ad}"} öğrencinin adını, {"{gün}"} sınavına kalan günü yazar.
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            resetPreview();
          }}
          rows={9}
          maxLength={8000}
          placeholder={"Merhaba {ad},\n\nYazmak istediğin mesaj burada."}
          className="adm-input"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Düğme yazısı (isteğe bağlı)
          <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={40} placeholder="Çalışmaya devam et" className="adm-input" />
        </label>
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Düğmenin gideceği yer (yalnız cortexplus.app)
          <input value={ctaPath} onChange={(event) => setCtaPath(event.target.value)} maxLength={300} placeholder="/deneme-sinavlari" className="adm-input" />
        </label>
      </div>

      {message ? (
        <p role="alert" className="adm-note adm-note--warn">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="adm-btn" disabled={pending || busy || subject.trim().length < 3 || body.trim().length < 10} onClick={sendTest}>
          Kendime deneme gönder
        </button>
        {mode === "single" ? (
          <button type="button" className="adm-btn adm-btn--primary" disabled={pending || !to.includes("@") || subject.trim().length < 3 || body.trim().length < 10} onClick={submitSingle}>
            {pending ? "Gönderiliyor…" : "Gönder"}
          </button>
        ) : (
          <button type="button" className="adm-btn adm-btn--primary" disabled={pending || busy || subject.trim().length < 3 || body.trim().length < 10} onClick={runPreview}>
            {pending ? "Hesaplanıyor…" : "Kimlere gideceğini göster"}
          </button>
        )}
      </div>

      {bulk && preview ? (
        <div className="adm-note adm-note--info grid gap-3" aria-live="polite">
          <p className="text-sm">
            Bu mesaj <strong>{formatCount(preview.data.count)} kişiye</strong> gidecek.
          </p>
          {preview.data.sample.length ? (
            <ul className="text-xs text-[var(--adm-muted)]">
              {preview.data.sample.map((row) => (
                <li key={row.email}>
                  {row.email}
                  {row.firstName ? ` · ${row.firstName}` : ""}
                  {row.daysToExam !== null ? ` · sınava ${row.daysToExam} gün` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.warning ? <p className="text-sm">{preview.warning}</p> : null}
          {!preview.open ? <p className="text-sm">Kampanya anahtarı kapalı: gönderilemez.</p> : null}
          {!resendReady ? <p className="text-sm">E-posta altyapısı (Resend) yapılandırılmamış: toplu gönderilemez.</p> : null}
          {preview.data.count > 0 ? (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
                Göndermek için kişi sayısını yaz ({preview.data.count})
                <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} inputMode="numeric" className="adm-input w-40" />
              </label>
              <div>
                <button type="button" className="adm-btn adm-btn--primary" disabled={!canConfirm || busy} onClick={() => void startBulk()}>
                  {busy ? "Gönderiliyor…" : `${formatCount(preview.data.count)} kişiye gönder`}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {progress ? <CampaignProgressView progress={progress} busy={busy} onResume={() => void runLoop(progress.id)} onStop={() => (stopRef.current = true)} finished={Boolean(finished)} /> : null}
    </div>
  );
}

export function CampaignProgressView({
  progress,
  busy,
  finished,
  onResume,
  onStop,
}: {
  progress: CampaignProgress;
  busy: boolean;
  finished: boolean;
  onResume: () => void;
  onStop: () => void;
}) {
  const done = progress.sent + progress.failed + progress.skipped;
  const percent = progress.total ? Math.min(100, Math.round((done / progress.total) * 100)) : 0;
  const reason = stopReasonText(progress.stopReason);
  return (
    <div className="adm-note adm-note--info grid gap-2" aria-live="polite">
      <p className="text-sm">
        {finished
          ? progress.status === "cancelled"
            ? "Gönderim durduruldu."
            : "Gönderim bitti."
          : busy
            ? "Gönderiliyor…"
            : "Gönderim duruyor."}{" "}
        {formatCount(progress.sent)} gönderildi · {formatCount(progress.remaining)} bekliyor · {formatCount(progress.skipped)} atlandı ·{" "}
        {formatCount(progress.failed)} başarısız (toplam {formatCount(progress.total)}).
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--adm-line)]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-[var(--adm-accent,#4353f3)]" style={{ width: `${percent}%` }} />
      </div>
      {reason ? <p className="text-sm">{reason}</p> : null}
      {!finished ? (
        <div className="flex gap-2">
          {busy ? (
            <button type="button" className="adm-btn" onClick={onStop}>
              Durdur
            </button>
          ) : (
            <button type="button" className="adm-btn adm-btn--primary" onClick={onResume}>
              Devam et
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Son gönderimler tablosundaki "Devam et" / "Durdur" düğmeleri. */
export function CampaignRowControls({ campaignId, initial }: { campaignId: string; initial: CampaignProgress }) {
  const [progress, setProgress] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function resume() {
    setBusy(true);
    stopRef.current = false;
    for (;;) {
      const result = await continueEmailCampaign(campaignId);
      if (!result.ok) {
        setMessage(result.error);
        break;
      }
      setProgress(result.progress);
      if (result.progress.status !== "sending" || result.progress.stopReason || stopRef.current) break;
    }
    setBusy(false);
  }

  async function cancel() {
    const result = await stopEmailCampaign(campaignId);
    if (result.ok) setProgress({ ...progress, status: "cancelled" });
    else setMessage(result.error ?? "Durdurulamadı.");
  }

  if (progress.status !== "sending") return <span className="text-xs text-[var(--adm-muted)]">{progress.status === "sent" ? "Bitti" : "Durduruldu"}</span>;
  const reason = stopReasonText(progress.stopReason);
  return (
    <div className="grid gap-1">
      <div className="flex gap-2">
        <button type="button" className="adm-btn" disabled={busy} onClick={() => void resume()}>
          {busy ? "Gönderiliyor…" : "Devam et"}
        </button>
        <button type="button" className="adm-btn" disabled={busy} onClick={() => void cancel()}>
          Durdur
        </button>
      </div>
      {reason ? <span className="text-xs text-[var(--adm-muted)]">{reason}</span> : null}
      {message ? <span className="text-xs text-[var(--adm-muted)]">{message}</span> : null}
    </div>
  );
}
