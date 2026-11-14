"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { getGate, resolvePlan, snapshotFromAccount } from "@/lib/entitlements/gate";
import { sheetContent, type PlanPrices } from "@/lib/entitlements/sheet-copy";
import { track } from "@/lib/entitlements/track";
import type { Action, EntitlementSnapshot, Gate, GateContext } from "@/lib/entitlements/types";
import { UpgradeSheet } from "@/components/entitlements/upgrade-sheet";

/*
  Hak sisteminin istemci katmanı (Faz 3B). Plan YALNIZ burada çözülür (`resolvePlan`); bileşenler planı okumaz,
  `useGate` / `<Gate>` üzerinden kapıyı okur. Kapı kabuk hesabından kurulur (sunucunun okuduğu değerler); karar yine
  sunucudadır: 402 gelirse gövdedeki `gate` kazanır (`openFromRefusal`).

  Sağlayıcı yoksa (kabuğu olmayan sayfa) kancalar hesap yoksa açık kapı döner ve pencere açılmaz: hiçbir kontrol
  yanlışlıkla kilitlenmez.

  Fiyatlar: veritabanındaki etkin planlardan (`plans.price_try`, herkese açık; ana sayfa da aynı anahtarla okur).
  Sayfa sunucuda okumaz (ana ekranda Plus kartı yok kuralı, 8 Kasım 2026); tarayıcı yalnız kilitli bir kapı
  görününce ya da pencere açılınca, oturumda bir kez okur. Okunamazsa düğmeler fiyatsız yazılır, pencere yine açılır.
*/

const PRICE_SLUGS = { plusMonthly: "plus-aylik", plusWeekly: "plus-haftalik", sigmaMonthly: "sigma-aylik" } as const;

async function loadPrices(): Promise<PlanPrices | null> {
  try {
    const { data, error } = await createClient()
      .from("plans")
      .select("slug, price_try")
      .eq("active", true)
      .in("slug", Object.values(PRICE_SLUGS));
    if (error || !data) return null;
    const price = (slug: string) => {
      const row = (data as { slug: string; price_try: unknown }[]).find((plan) => plan.slug === slug);
      return typeof row?.price_try === "number" ? row.price_try : null;
    };
    return { plusMonthly: price(PRICE_SLUGS.plusMonthly), plusWeekly: price(PRICE_SLUGS.plusWeekly), sigmaMonthly: price(PRICE_SLUGS.sigmaMonthly) };
  } catch {
    return null;
  }
}

type SheetState = { gate: Gate; action: Action; trigger: HTMLElement | null };

type EntitlementUi = {
  snapshot: EntitlementSnapshot | null;
  prices: PlanPrices;
  examDaysLeft: number | null;
  openSheet: (gate: Gate, action: Action, trigger?: HTMLElement | null) => boolean;
  /** Fiyatları önceden oku (kilitli kapı görününce). */
  prefetchPrices: () => void;
};

const NO_PRICES: PlanPrices = { plusMonthly: null, plusWeekly: null, sigmaMonthly: null };
const Ctx = createContext<EntitlementUi | null>(null);

export function EntitlementUiProvider({
  prices: givenPrices,
  examDaysLeft = null,
  firstLesson = null,
  children,
}: {
  /** Verilirse tarayıcı okumaz (fikstür ve testler). */
  prices?: PlanPrices;
  examDaysLeft?: number | null;
  /** Ücretsiz hesabın ilk dersi (sunucu `firstLessonStatus`); bilinmiyorsa null (kapı açık der). */
  firstLesson?: EntitlementSnapshot["firstLesson"];
  children: ReactNode;
}) {
  const account = useStudentShellAccount();
  const snapshot = useMemo(() => (account ? snapshotFromAccount(account, { firstLesson }) : null), [account, firstLesson]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const plan = account ? resolvePlan(account).plan : null;
  const planRef = useRef(plan);
  planRef.current = plan;
  const [loaded, setLoaded] = useState<PlanPrices | null>(null);
  const prices = givenPrices ?? loaded ?? NO_PRICES;
  const requested = useRef(Boolean(givenPrices));
  const prefetchPrices = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    void loadPrices().then((value) => {
      if (value) setLoaded(value);
      else requested.current = false;
    });
  }, []);

  const openSheet = useCallback((gate: Gate, action: Action, trigger: HTMLElement | null = null) => {
    // Sigma ve Kurucu'ya pencere yok; pencere açmayan nedende (bekleme, harcama sigortası) çağıran bugünkü yolu izler.
    if (planRef.current === "founder" || planRef.current === "sigma") return false;
    if (!sheetContent({ reason: gate.reason, action, gate, prices: NO_PRICES })) return false;
    prefetchPrices();
    setSheet({ gate, action, trigger });
    if (planRef.current) track("upgrade_sheet_opened", { action, plan: planRef.current, reason: gate.reason });
    return true;
  }, [prefetchPrices]);

  const value = useMemo<EntitlementUi>(
    () => ({ snapshot, prices, examDaysLeft, openSheet, prefetchPrices }),
    [snapshot, prices, examDaysLeft, openSheet, prefetchPrices],
  );
  const content = sheet ? sheetContent({ reason: sheet.gate.reason, action: sheet.action, gate: sheet.gate, prices, examDaysLeft }) : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {sheet && content ? (
        <UpgradeSheet
          content={content}
          onClose={() => {
            const trigger = sheet.trigger;
            setSheet(null);
            // Odak tetikleyiciye döner (klavye kullanıcısı yerini kaybetmesin).
            requestAnimationFrame(() => trigger?.focus?.());
          }}
          onChoose={(target) => {
            if (plan) track("upgrade_clicked", { action: sheet.action, plan, reason: sheet.gate.reason, target });
          }}
        />
      ) : null}
    </Ctx.Provider>
  );
}

export function useEntitlementUi(): EntitlementUi | null {
  return useContext(Ctx);
}

const OPEN: Gate = { state: "open", reason: "open" };

/** Bu eylemin kapısı (kabuk hesabından). Sağlayıcı ya da hesap yoksa açık. */
export function useGate(action: Action, context: GateContext = {}): Gate {
  const ui = useContext(Ctx);
  const { firstLessonCycle, otherTopic } = context;
  return useMemo(
    () => (ui?.snapshot ? getGate(ui.snapshot, action, { firstLessonCycle, otherTopic }) : OPEN),
    [ui?.snapshot, action, firstLessonCycle, otherTopic],
  );
}

const QUOTA_NOTICE_KEY = "cx-quota-90-notice";

/** İstanbul günü (YYYY-AA-GG): %90 penceresi günde en çok bir kez. */
function istanbulDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * %90 eşiği pop-up değildir (ANA-PROMPT 3B): kota tüketen eylem BAŞARIYLA bittikten sonra, günde en çok bir kez,
 * kapatılabilir pencere. Yalnız Plus (Sınav Haftası ve Sigma'da kota penceresi yok, karar 2). Depolama okunamazsa
 * pencere açılmaz (öğrenciyi her mesajda rahatsız etmeyelim).
 */
export function useQuotaNotice(): (action: Action) => void {
  const ui = useContext(Ctx);
  return useCallback(
    (action: Action) => {
      if (!ui?.snapshot || ui.snapshot.plan !== "plus") return;
      const gate = getGate(ui.snapshot, action);
      if (gate.reason !== "plus_quota_90") return;
      try {
        const today = istanbulDayKey();
        if (window.localStorage.getItem(QUOTA_NOTICE_KEY) === today) return;
        window.localStorage.setItem(QUOTA_NOTICE_KEY, today);
      } catch {
        return;
      }
      ui.openSheet(gate, action, (document.activeElement as HTMLElement | null) ?? null);
    },
    [ui],
  );
}

/** 402 gövdesindeki kapıyla pencere aç (sunucu kazanır). Pencere açıldıysa true. */
export function useOpenFromRefusal(): (body: unknown, action: Action, trigger?: HTMLElement | null) => boolean {
  const ui = useContext(Ctx);
  return useCallback(
    (body: unknown, action: Action, trigger: HTMLElement | null = null) => {
      const gate = (body as { gate?: Gate } | null)?.gate;
      if (!ui || !gate || typeof gate.reason !== "string") return false;
      return ui.openSheet(gate, action, trigger);
    },
    [ui],
  );
}
