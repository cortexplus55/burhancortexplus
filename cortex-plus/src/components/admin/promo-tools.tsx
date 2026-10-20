"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPromoCode, togglePromoCode } from "@/app/admin/actions";
import { createSharedBetaCode, generateBetaCodeBatch } from "@/app/admin/beta-code-actions";
import {
  BETA_BATCH_MAX,
  BETA_PLUS_DAYS,
  SHARED_BETA_DEFAULT_USES,
  SHARED_BETA_MAX_USES,
} from "@/lib/billing/promo-codes";

/** Ortak beta kodu: tek bağlantı, ilk N kişi (sosyal medya duyurusu, 20 Ekim 2026). */
export function SharedBetaCodeForm({ origin }: { origin: string }) {
  const [code, setCode] = useState("");
  const [uses, setUses] = useState(String(SHARED_BETA_DEFAULT_USES));
  const [days, setDays] = useState(String(BETA_PLUS_DAYS));
  const [result, setResult] = useState<{ code: string; uses: number; days: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const usesNum = Number(uses);
  const daysNum = Number(days);
  const valid =
    /^[A-Za-z0-9-]*$/.test(code.trim()) &&
    (code.trim() === "" || code.trim().length >= 3) &&
    Number.isInteger(usesNum) &&
    usesNum >= 2 &&
    usesNum <= SHARED_BETA_MAX_USES &&
    Number.isInteger(daysNum) &&
    daysNum >= 1 &&
    daysNum <= 90;
  const link = result ? `${origin}/pay?kod=${result.code}` : "";

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} kopyalandı.`);
    } catch {
      toast.error("Kopyalanamadı; metni seçip kopyala.");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Kod (boş = üretilir)
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="CORTEXBETA"
            aria-label="Ortak kod"
            className="adm-input font-mono"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Kişi
          <input
            type="number"
            min={2}
            max={SHARED_BETA_MAX_USES}
            value={uses}
            onChange={(event) => setUses(event.target.value)}
            aria-label="Kaç kişi kullanabilir"
            className="adm-input w-24"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Plus gün
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            aria-label="Ortak kod Plus gün sayısı"
            className="adm-input w-24"
          />
        </label>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={pending || !valid}
          onClick={() =>
            startTransition(async () => {
              const response = await createSharedBetaCode({ code: code.trim() || undefined, uses: usesNum, days: daysNum });
              if (response.ok) {
                setResult({ code: response.code, uses: response.uses, days: response.days });
                toast.success(`${response.code} oluşturuldu (${response.uses} kişi).`);
              } else {
                toast.error(response.error);
              }
            })
          }
        >
          {pending ? "Oluşturuluyor…" : "Ortak kod oluştur"}
        </button>
      </div>
      {result ? (
        <div className="grid gap-2">
          <p className="text-xs text-[var(--adm-muted)]">
            {result.code} · ilk {result.uses} kişiye {result.days} gün Plus. Herkes bir kez kullanır; deneme hakkını daha önce
            kullanan ya da ücretli abonesi olan açamaz.
          </p>
          <input readOnly value={link} aria-label="Ortak kod bağlantısı" className="adm-input font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="adm-btn" onClick={() => copy(result.code, "Kod")}>
              Kodu kopyala
            </button>
            <button type="button" className="adm-btn" onClick={() => copy(link, "Bağlantı")}>
              Bağlantıyı kopyala
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Yeni kampanya kodu formu. */
export function PromoCreateForm() {
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState("100");
  const [limit, setLimit] = useState("");
  const [pending, startTransition] = useTransition();

  const creditsNum = Number(credits);
  const limitNum = limit.trim() ? Number(limit) : null;
  const valid =
    code.trim().length >= 3 &&
    /^[A-Za-z0-9-]+$/.test(code.trim()) &&
    Number.isInteger(creditsNum) &&
    creditsNum > 0 &&
    (limitNum === null || (Number.isInteger(limitNum) && limitNum > 0));

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Kod
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ORNEK-2026"
          aria-label="Kampanya kodu"
          className="adm-input"
        />
      </label>

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Hediye kredi
        <input
          type="number"
          min={1}
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          aria-label="Hediye kredi"
          className="adm-input w-32"
        />
      </label>

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Kaç kişi (boş = sınırsız)
        <input
          type="number"
          min={1}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          placeholder="sınırsız"
          aria-label="Kullanım sınırı"
          className="adm-input w-40"
        />
      </label>

      <button
        type="button"
        className="adm-btn adm-btn--primary"
        disabled={pending || !valid}
        onClick={() =>
          startTransition(async () => {
            const result = await createPromoCode({
              code: code.trim(),
              creditAmount: creditsNum,
              maxRedemptions: limitNum,
            });
            if (result.ok) {
              toast.success(result.message ?? "Kod oluşturuldu.");
              setCode("");
              setLimit("");
            } else {
              toast.error(result.error ?? "Oluşturulamadı.");
            }
          })
        }
      >
        {pending ? "Oluşturuluyor…" : "Kod oluştur"}
      </button>
    </div>
  );
}

/** Kodu açıp kapatan düğme. */
export function PromoToggle({ promoId, active }: { promoId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={`adm-btn${active ? " adm-btn--danger" : ""}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await togglePromoCode(promoId, !active);
          if (result.ok) toast.success(result.message ?? "Güncellendi.");
          else toast.error(result.error ?? "Güncellenemedi.");
        })
      }
    >
      {pending ? "…" : active ? "Kapat" : "Aç"}
    </button>
  );
}

/**
 * Kapalı beta kodları (19 Ekim 2026): tek kullanımlık, her biri `gün` kadar Plus açar.
 * Üretilen kodlar burada bir kez listelenir; kod ya da hazır bağlantı olarak kopyalanır.
 */
export function BetaCodeForm({ origin }: { origin: string }) {
  const [count, setCount] = useState("10");
  const [days, setDays] = useState(String(BETA_PLUS_DAYS));
  const [batch, setBatch] = useState("");
  const [result, setResult] = useState<{ batch: string; codes: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const countNum = Number(count);
  const daysNum = Number(days);
  const valid =
    Number.isInteger(countNum) &&
    countNum >= 1 &&
    countNum <= BETA_BATCH_MAX &&
    Number.isInteger(daysNum) &&
    daysNum >= 1 &&
    daysNum <= 90 &&
    /^[A-Za-z0-9 _-]*$/.test(batch);

  const links = result?.codes.map((code) => `${origin}/pay?kod=${code}`) ?? [];

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} kopyalandı.`);
    } catch {
      toast.error("Kopyalanamadı; listeden seçip kopyala.");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Adet
          <input
            type="number"
            min={1}
            max={BETA_BATCH_MAX}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            aria-label="Kod adedi"
            className="adm-input w-24"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Plus gün
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            aria-label="Plus gün sayısı"
            className="adm-input w-24"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Grup adı (boş = bugünün tarihi)
          <input
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            placeholder="beta-1"
            aria-label="Grup adı"
            className="adm-input"
          />
        </label>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={pending || !valid}
          onClick={() =>
            startTransition(async () => {
              const response = await generateBetaCodeBatch({ count: countNum, days: daysNum, batch: batch.trim() || undefined });
              if (response.ok) {
                setResult({ batch: response.batch, codes: response.codes });
                toast.success(`${response.codes.length} kod oluşturuldu (${response.batch}).`);
              } else {
                toast.error(response.error);
              }
            })
          }
        >
          {pending ? "Oluşturuluyor…" : "Beta kodu üret"}
        </button>
      </div>

      {result ? (
        <div className="grid gap-2">
          <p className="text-xs text-[var(--adm-muted)]">
            {result.batch} · {result.codes.length} kod. Her kod tek kişilik; bağlantı Abonelik sayfasını kod dolu açar
            (giriş ya da kayıttan sonra da).
          </p>
          <textarea
            readOnly
            value={result.codes.join("\n")}
            aria-label="Üretilen kodlar"
            rows={Math.min(10, result.codes.length)}
            className="adm-input font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="adm-btn" onClick={() => copy(result.codes.join("\n"), "Kodlar")}>
              Kodları kopyala
            </button>
            <button type="button" className="adm-btn" onClick={() => copy(links.join("\n"), "Bağlantılar")}>
              Bağlantıları kopyala
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
