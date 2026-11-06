"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustCredits } from "@/app/admin/actions";
import {
  adjustUserStars,
  cancelUserPlan,
  confirmUserEmail,
  grantUserPlan,
  resetUserDevices,
  type ActionResult,
} from "@/app/admin/kullanicilar/actions";
import { GRANT_DAYS_MAX, GRANT_DAYS_MIN, STAR_ADJUST_MAX } from "@/lib/admin/user-manage-copy";

/*
  Kullanıcı sayfasındaki yönetim araçları (6 Kasım 2026): paket tanımlama ve iptal, hediye kredi, yıldız,
  e-posta onayı, cihaz oturumları. Geri alınması zor işlemler (iptal, çıkış) sayfa içinde ikinci tıklamayla onaylanır;
  uygulama içi tarayıcıda açılmayan tarayıcı onay penceresi kullanılmaz.
*/

type Runner = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => void;

function useRunner(): [boolean, Runner] {
  const [pending, startTransition] = useTransition();
  const run: Runner = (fn, after) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? "Tamamlandı.");
        after?.();
      } else toast.error(result.error ?? "İşlem yapılamadı.");
    });
  return [pending, run];
}

export function UserPlanTools({
  userId,
  plans,
  activePlanLabel,
}: {
  userId: string;
  plans: { id: string; label: string }[];
  /** Süren abonelik varsa adı; iptal düğmesi yalnız o zaman. */
  activePlanLabel: string | null;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [days, setDays] = useState("30");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, run] = useRunner();
  const value = Number(days);
  const ready = Boolean(planId) && Number.isInteger(value) && value >= GRANT_DAYS_MIN && value <= GRANT_DAYS_MAX;

  if (!plans.length) return <p className="text-sm">Satışta tanımlanabilecek bir plan bulunamadı.</p>;

  return (
    <div className="adm-tool-stack">
      <div className="adm-tool-row">
        <label className="adm-tool-field">
          <span>Plan</span>
          <select value={planId} onChange={(event) => setPlanId(event.target.value)} className="adm-input">
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-tool-field adm-tool-field--narrow">
          <span>Gün</span>
          <input
            type="number"
            inputMode="numeric"
            min={GRANT_DAYS_MIN}
            max={GRANT_DAYS_MAX}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="adm-input"
          />
        </label>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={pending || !ready}
          onClick={() => run(() => grantUserPlan({ userId, planId, days: value }))}
        >
          {activePlanLabel ? "Süreye ekle" : "Paketi tanımla"}
        </button>
      </div>
      <p className="adm-tool-hint">
        Ücret alınmaz, ödeme kaydı yazılmaz. Süren dönem varsa gün sonuna eklenir; plan değişirse kullanım hakkı yeni
        plana göre yazılır.
      </p>
      {activePlanLabel ? (
        confirmCancel ? (
          <div className="adm-confirm" role="alertdialog" aria-label="Abonelik iptali onayı">
            <p>
              <strong>{activePlanLabel}</strong> hemen bitsin mi? Kalan kullanım hakkı sıfırlanır, hesap ücretsize döner.
            </p>
            <div className="adm-tool-row">
              <button
                type="button"
                className="adm-btn adm-btn--danger"
                disabled={pending}
                onClick={() => run(() => cancelUserPlan({ userId }), () => setConfirmCancel(false))}
              >
                Evet, iptal et
              </button>
              <button type="button" className="adm-btn" onClick={() => setConfirmCancel(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirmCancel(true)}>
            Aboneliği iptal et
          </button>
        )
      ) : null}
    </div>
  );
}

export function UserRewardTools({ userId, balance, stars }: { userId: string; balance: number; stars: number | null }) {
  const [credit, setCredit] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [star, setStar] = useState("");
  const [pending, run] = useRunner();
  const creditValue = Number(credit);
  const starValue = Number(star);
  const creditReady = Number.isInteger(creditValue) && creditValue !== 0 && Math.abs(creditValue) <= 10000;
  const starReady = Number.isInteger(starValue) && starValue !== 0 && Math.abs(starValue) <= STAR_ADJUST_MAX;

  return (
    <div className="adm-tool-stack">
      <div className="adm-tool-row">
        <label className="adm-tool-field adm-tool-field--narrow">
          <span>Hediye kredi (şu an {balance})</span>
          <input
            type="number"
            inputMode="numeric"
            value={credit}
            onChange={(event) => setCredit(event.target.value)}
            placeholder="±50"
            aria-label="Hediye kredi; düşmek için başına eksi koyun"
            className="adm-input"
          />
        </label>
        <label className="adm-tool-field">
          <span>Not (isteğe bağlı)</span>
          <input
            type="text"
            maxLength={200}
            value={creditReason}
            onChange={(event) => setCreditReason(event.target.value)}
            placeholder="Örn. destek telafisi"
            className="adm-input"
          />
        </label>
        <button
          type="button"
          className="adm-btn"
          disabled={pending || !creditReady}
          onClick={() =>
            run(
              () => adjustCredits({ userId, delta: creditValue, reason: creditReason.trim() || undefined }),
              () => {
                setCredit("");
                setCreditReason("");
              },
            )
          }
        >
          Krediyi uygula
        </button>
      </div>
      <div className="adm-tool-row">
        <label className="adm-tool-field adm-tool-field--narrow">
          <span>Yıldız (şu an {stars ?? "—"})</span>
          <input
            type="number"
            inputMode="numeric"
            value={star}
            onChange={(event) => setStar(event.target.value)}
            placeholder="±100"
            aria-label="Yıldız; düşmek için başına eksi koyun"
            className="adm-input"
          />
        </label>
        <button
          type="button"
          className="adm-btn"
          disabled={pending || !starReady}
          onClick={() =>
            run(
              () => adjustUserStars({ userId, delta: starValue }),
              () => setStar(""),
            )
          }
        >
          Yıldızı uygula
        </button>
      </div>
      <p className="adm-tool-hint">
        Artı sayı ekler, eksi sayı düşer. Kredi ve yıldız sıfırın altına inmez; yıldız düzeltmesi günlük hedef bonusunu
        tetiklemez.
      </p>
    </div>
  );
}

export function UserAccountTools({
  userId,
  emailState,
  openDevices,
  isSelf,
}: {
  userId: string;
  emailState: "verified" | "unverified" | "unknown";
  openDevices: number | null;
  isSelf: boolean;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, run] = useRunner();
  const runAction = (fn: () => Promise<ActionResult>, after?: () => void) => run(fn, after);

  return (
    <div className="adm-tool-stack">
      <div className="adm-tool-row">
        <p className="text-sm">
          E-posta:{" "}
          {emailState === "verified" ? "onaylı" : emailState === "unverified" ? "onay bekliyor" : "okunamadı"}
        </p>
        {emailState === "unverified" ? (
          <button
            type="button"
            className="adm-btn"
            disabled={pending}
            onClick={() => runAction(() => confirmUserEmail({ userId }))}
          >
            E-postayı onaylı işaretle
          </button>
        ) : null}
      </div>
      <div className="adm-tool-row">
        <p className="text-sm">Açık cihaz: {openDevices ?? "—"}</p>
        {confirmReset ? (
          <div className="adm-confirm" role="alertdialog" aria-label="Cihaz oturumları onayı">
            <p>
              Hesap bütün cihazlardan çıkarılsın mı? {isSelf ? "Bu senin hesabın; sen de çıkış yaparsın." : "Öğrenci yeniden giriş yapar."}
            </p>
            <div className="adm-tool-row">
              <button
                type="button"
                className="adm-btn adm-btn--danger"
                disabled={pending}
                onClick={() => runAction(() => resetUserDevices({ userId }), () => setConfirmReset(false))}
              >
                Evet, sıfırla
              </button>
              <button type="button" className="adm-btn" onClick={() => setConfirmReset(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="adm-btn" onClick={() => setConfirmReset(true)}>
            Cihaz oturumlarını sıfırla
          </button>
        )}
      </div>
    </div>
  );
}
