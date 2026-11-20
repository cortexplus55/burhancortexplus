import { firstTopicOwnNodes, type SummaryNode } from "@/lib/billing/free-topic-rule";
import { topicIdsOf } from "@/lib/learning/topic-identity";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { cockpitWindows } from "@/lib/admin/cockpit-math";

/*
  Günlük ve 7 günlük büyüme hunisi (20 Kasım 2026, ürün sahibinin isteği): kurucu kokpitinde kayıttan satışa
  her adımda kaç kişi kaldı. Saf hesap; veritabanı `funnel.ts`'te okunur.

  ANA GÖRÜNÜM KOHORT HUNİSİ. Pencere (bugün / son 7 gün, Türkiye günüyle; kokpitle aynı pencereler) içinde
  hesabı açılan öğrenciler bir kohorttur; her adım bir ÖNCEKİ adımı geçmiş kohort üyelerinden sayılır, yüzde bir
  önceki adıma göredir (huni hiç genişlemez, %100'ü geçmez):
    1. Yeni kayıt               profili pencerede açılan hesap (`profiles.created_at`).
    2. İlk hazırlığını kuran    en az bir sınav hazırlığı kurmuş. Çalışma Stüdyosu'nun geçici deneme kaydı
                                (`exam_type = 'deneme'`) ve "Hedef puan" kaydı (`'hedef'`) hazırlık değildir
                                (ürünün her sayımında olduğu gibi); silinen hazırlık sayılmaz (satır silinir).
    3. 1. üniteyi tamamlayan    hazırlıklarından birinin 1. konusunun (`exam_prep_topics.sort_order` ilk satırı;
                                belge konusunun kimliği de tanınır) KONU ANLATIMI adımını en az bir kez bitirmiş:
                                `kind = 'lesson'` düğümünde `exam_prep_node_attempts.status = 'completed'` kaydı.
                                Adım kümesi `firstTopicOwnNodes` (ücretsiz hesabın ilk dersiyle aynı tanım).
    4. Ödemeyi başlatan         PayTR ödeme ekranı açılmış: ödeme satırına PayTR oturumu yazılmış ya da satır
                                ödendi / iade edildi. Sunucuda ödeme sayfası ziyareti kaydı YOK; sayfayı açıp
                                vazgeçen sayılamaz.
    5. Başarılı satış           ödemesi kesinleşmiş (`status = 'paid'`; iade edilen sayılmaz, kokpitteki
                                "Başarılı ödeme" satırıyla aynı).
  Ödeme adımlarında kişi = hakkın tanımlandığı hesap (`beneficiary_user_id`, yoksa `user_id`): veli ödemesinde
  öğrenci. Adımları atlayıp (1. üniteyi bitirmeden) ödeyen kohort üyesi huniye girmez, ayrıca sayılır.

  YAN GÖRÜNÜM PENCEREDEKİ SATIŞLAR (kohorttan bağımsız): pencerede ödemeyi başlatan kişi, başarılı satış adedi,
  paket türüne göre ve veli ödemesi (velime ödeme bağlantısı ya da veli hesabıyla).

  Kaynak okunamazsa (null) o kaynağa dayanan sayı "okunamadı" olur; huni sırası yüzünden sonraki adımlar da.
  Satış tablosu kohorta değil yalnız ödeme kaynaklarına bağlıdır.
*/

export type FunnelWindowKey = "today" | "week";
export const FUNNEL_WINDOW_KEYS: readonly FunnelWindowKey[] = ["today", "week"];
export const FUNNEL_WINDOW_LABEL: Record<FunnelWindowKey, string> = { today: "Bugün", week: "Son 7 gün" };
export type FunnelWindows = Record<FunnelWindowKey, string>;

/** Kokpitin pencereleriyle aynı başlangıçlar (Türkiye günü, UTC+3). */
export function funnelWindows(now: Date): FunnelWindows {
  const windows = cockpitWindows(now);
  return { today: windows.today, week: windows.week };
}

/** Pencere başına sayı; null = kaynak okunamadı. */
export type FunnelCounts = Record<FunnelWindowKey, number | null>;

export type FunnelStageKey = "signup" | "prep" | "firstUnit" | "checkout" | "sale";
export type FunnelStage = {
  key: FunnelStageKey;
  label: string;
  counts: FunnelCounts;
  /** Bir önceki adıma göre yüzde (tam sayı); ilk adımda, payda 0 iken ya da sayı okunamadıysa null. */
  rate: FunnelCounts;
};

export const FUNNEL_STAGE_LABEL: Record<FunnelStageKey, string> = {
  signup: "Yeni kayıt",
  prep: "İlk hazırlığını kuran (aktivasyon)",
  firstUnit: "1. üniteyi tamamlayan",
  checkout: "Ödemeyi başlatan (PayTR ekranı açıldı)",
  sale: "Başarılı satış",
};

export type SaleKind = "plus_monthly" | "plus_weekly" | "plus_yearly" | "sigma" | "addon" | "unknown";
export const SALE_KIND_LABEL: Record<SaleKind, string> = {
  plus_monthly: "Plus (aylık)",
  plus_weekly: "Sınav Haftası (haftalık Plus)",
  plus_yearly: "Plus (yıllık)",
  sigma: "Sigma",
  addon: "Ek paket",
  unknown: "Paket bilinmiyor",
};
/** Satış tablosunda sıfır olsa da yazılan türler (ürün sahibinin saydığı dört paket). */
const ALWAYS_SHOWN: readonly SaleKind[] = ["plus_monthly", "plus_weekly", "sigma", "addon"];
const KIND_ORDER: readonly SaleKind[] = ["plus_monthly", "plus_weekly", "plus_yearly", "sigma", "addon", "unknown"];

export type FunnelSignup = { id: string; createdAt: string };
export type FunnelPrep = { id: string; userId: string; examType: string | null };
export type FunnelTopic = { id: string; prepId: string; documentTopicNodeId: string | null; sortOrder: number };
export type FunnelNode = { id: string; prepId: string; kind: string; status: string; title: string | null; sessionMeta: unknown };
export type FunnelAttempt = { userId: string; nodeId: string };
export type FunnelPayment = {
  merchantOid: string | null;
  userId: string;
  beneficiaryUserId: string | null;
  planId: string | null;
  status: string;
  /** PayTR ödeme oturumu kuruldu (satırda oturum var). Oturumun kendisi okunmaz. */
  opened: boolean;
  createdAt: string;
};
export type FunnelPlan = {
  id: string;
  slug: string | null;
  name: string | null;
  tier: string | null;
  billingPeriod: string | null;
  isPremium: boolean | null;
};

export type FunnelInput = {
  signups: FunnelSignup[] | null;
  preps: FunnelPrep[] | null;
  topics: FunnelTopic[] | null;
  lessonNodes: FunnelNode[] | null;
  attempts: FunnelAttempt[] | null;
  payments: FunnelPayment[] | null;
  plans: FunnelPlan[] | null;
  /** Veli ödemesinin sipariş numaraları (denetim kaydı `payment.token.created`, `via` veli). Okunamadıysa null. */
  parentOids: ReadonlySet<string> | null;
};

export type SalesRow = { kind: SaleKind; label: string; counts: FunnelCounts };
export type GrowthFunnel = {
  windows: FunnelWindows;
  stages: FunnelStage[];
  /** Kohortta ödeyen ama 1. üniteyi bitirmemiş (huniye girmeyen) kişi. */
  skippedPayers: FunnelCounts;
  sales: {
    starters: FunnelCounts;
    paid: FunnelCounts;
    byKind: SalesRow[];
    /** Veli ödemesi: velime ödeme bağlantısı ya da veli hesabıyla (ödeyen ≠ hakkın sahibi). */
    parent: FunnelCounts;
  };
};

function inWindow(stamp: string | null | undefined, since: string): boolean {
  if (!stamp) return false;
  const at = Date.parse(stamp);
  return Number.isFinite(at) && at >= Date.parse(since);
}

function counts(value: (key: FunnelWindowKey) => number | null): FunnelCounts {
  return { today: value("today"), week: value("week") };
}

/** Yüzde (tam sayı); payda 0 ya da sayı bilinmiyorsa null. */
export function stepRate(count: number | null, previous: number | null): number | null {
  if (count == null || previous == null || !(previous > 0)) return null;
  return Math.round((count / previous) * 100);
}

/** Hazırlık sayılır mı: Stüdyo'nun geçici deneme kaydı ve "Hedef puan" kaydı sayılmaz. */
export function countsAsPrep(examType: string | null | undefined): boolean {
  return examType !== STUDIO_EXAM_TYPE && examType !== "hedef";
}

/** Hazırlık başına 1. konunun kimlikleri (konu kimliği ve belge konusunun kimliği). */
export function firstTopicIdsByPrep(topics: readonly FunnelTopic[]): Map<string, ReadonlySet<string>> {
  const first = new Map<string, FunnelTopic>();
  for (const topic of topics) {
    if (!topic.prepId || !topic.id) continue;
    const seen = first.get(topic.prepId);
    if (!seen || topic.sortOrder < seen.sortOrder || (topic.sortOrder === seen.sortOrder && topic.id < seen.id)) first.set(topic.prepId, topic);
  }
  const out = new Map<string, ReadonlySet<string>>();
  for (const [prepId, topic] of first) out.set(prepId, new Set(topicIdsOf({ id: topic.id, documentTopicNodeId: topic.documentTopicNodeId })));
  return out;
}

/** 1. konunun konu anlatımı düğümleri (hazırlık → düğüm kimlikleri). */
export function firstUnitLessonNodeIds(nodes: readonly FunnelNode[], firstIds: ReadonlyMap<string, ReadonlySet<string>>): Map<string, string> {
  const byPrep = new Map<string, SummaryNode[]>();
  for (const node of nodes) {
    if (node.kind !== "lesson") continue;
    const list = byPrep.get(node.prepId) ?? [];
    list.push({ id: node.id, kind: node.kind, status: node.status, title: node.title, session_meta: node.sessionMeta as SummaryNode["session_meta"] });
    byPrep.set(node.prepId, list);
  }
  const out = new Map<string, string>();
  for (const [prepId, list] of byPrep) {
    const ids = firstIds.get(prepId);
    if (!ids?.size) continue;
    for (const node of firstTopicOwnNodes(list, ids)) out.set(node.id, prepId);
  }
  return out;
}

/** Paket türü (`purchaseKindFor` ile aynı sıra; bekçi test ikisini karşılaştırır). */
export function saleKind(plan: FunnelPlan | null | undefined): SaleKind {
  if (!plan) return "unknown";
  const slug = plan.slug ?? "";
  const haystack = `${slug} ${plan.name ?? ""}`.toLowerCase();
  if (plan.billingPeriod === "one_time" || /^ek-kredi/.test(slug)) return plan.isPremium ? "unknown" : "addon";
  if (!plan.isPremium) return "unknown";
  if ((plan.tier ?? "").toLowerCase() === "sigma" || haystack.includes("sigma")) return "sigma";
  if (plan.billingPeriod === "weekly") return "plus_weekly";
  if (plan.billingPeriod === "yearly") return "plus_yearly";
  return "plus_monthly";
}

/** Ödemenin kişisi: hakkın tanımlandığı hesap (veli ödemesinde öğrenci). */
export function paymentHolder(payment: Pick<FunnelPayment, "userId" | "beneficiaryUserId">): string {
  return payment.beneficiaryUserId || payment.userId;
}

/** Ödeme ekranı açıldı mı: PayTR oturumu kuruldu ya da ödeme sonuçlandı. */
export function checkoutOpened(payment: Pick<FunnelPayment, "opened" | "status">): boolean {
  return payment.opened || payment.status === "paid" || payment.status === "refunded";
}

/** Veli ödemesi: denetim kaydında veli yolu ya da ödeyen ≠ hakkın sahibi. */
export function parentPayment(payment: FunnelPayment, parentOids: ReadonlySet<string> | null): boolean {
  if (payment.beneficiaryUserId && payment.beneficiaryUserId !== payment.userId) return true;
  return Boolean(payment.merchantOid && parentOids?.has(payment.merchantOid));
}

export function growthFunnel(input: FunnelInput, windows: FunnelWindows): GrowthFunnel {
  const cohort = (key: FunnelWindowKey): Set<string> | null =>
    input.signups ? new Set(input.signups.filter((row) => inWindow(row.createdAt, windows[key])).map((row) => row.id)) : null;
  const cohorts = { today: cohort("today"), week: cohort("week") };

  // 2. Hazırlık kuranlar (hazırlık sahibine göre).
  const prepOwner = new Map<string, string>();
  const prepUsers = new Set<string>();
  if (input.preps) {
    for (const prep of input.preps) {
      if (!countsAsPrep(prep.examType)) continue;
      prepOwner.set(prep.id, prep.userId);
      prepUsers.add(prep.userId);
    }
  }

  // 3. 1. üniteyi tamamlayanlar.
  const unitUsers: Set<string> | null =
    input.preps && input.topics && input.lessonNodes && input.attempts ? new Set<string>() : null;
  if (unitUsers) {
    const firstIds = firstTopicIdsByPrep(input.topics!.filter((topic) => prepOwner.has(topic.prepId)));
    const lessonPrep = firstUnitLessonNodeIds(input.lessonNodes!.filter((node) => prepOwner.has(node.prepId)), firstIds);
    for (const attempt of input.attempts!) {
      const prepId = lessonPrep.get(attempt.nodeId);
      if (prepId && prepOwner.get(prepId) === attempt.userId) unitUsers.add(attempt.userId);
    }
  }

  // 4–5. Ödeme ekranı açılan ve ödenen (kişi = hakkın sahibi).
  const payments = input.payments;
  const openedUsers = payments ? new Set(payments.filter(checkoutOpened).map(paymentHolder)) : null;
  const paidUsers = payments ? new Set(payments.filter((row) => row.status === "paid").map(paymentHolder)) : null;

  const within = (set: Set<string> | null, members: Set<string> | null): Set<string> | null =>
    set && members ? new Set([...members].filter((id) => set.has(id))) : null;

  const stageSets = (key: FunnelWindowKey) => {
    const signup = cohorts[key];
    const prep = within(input.preps ? prepUsers : null, signup);
    const firstUnit = within(unitUsers, prep);
    const checkout = within(openedUsers, firstUnit);
    const sale = within(paidUsers, checkout);
    const skipped = signup && paidUsers && unitUsers ? [...signup].filter((id) => paidUsers.has(id) && !(sale?.has(id) ?? false)).length : null;
    return { signup, prep, firstUnit, checkout, sale, skipped };
  };
  const sets = { today: stageSets("today"), week: stageSets("week") };

  const order: FunnelStageKey[] = ["signup", "prep", "firstUnit", "checkout", "sale"];
  const stages: FunnelStage[] = order.map((stageKey, index) => {
    const stageCounts = counts((key) => sets[key][stageKey]?.size ?? null);
    const previousKey = index > 0 ? order[index - 1] : null;
    const rate = counts((key) => (previousKey ? stepRate(stageCounts[key], sets[key][previousKey]?.size ?? null) : null));
    return { key: stageKey, label: FUNNEL_STAGE_LABEL[stageKey], counts: stageCounts, rate };
  });

  // Penceredeki satışlar (kohorttan bağımsız).
  const windowRows = (key: FunnelWindowKey) => (payments ? payments.filter((row) => inWindow(row.createdAt, windows[key])) : null);
  const paidRows = (key: FunnelWindowKey) => windowRows(key)?.filter((row) => row.status === "paid") ?? null;
  const planById = new Map((input.plans ?? []).map((plan) => [plan.id, plan]));
  const kindOf = (row: FunnelPayment): SaleKind => (input.plans ? saleKind(row.planId ? planById.get(row.planId) : null) : "unknown");
  const byKind: SalesRow[] = [];
  for (const kind of KIND_ORDER) {
    const kindCounts = counts((key) => {
      if (!input.plans) return null;
      return paidRows(key)?.filter((row) => kindOf(row) === kind).length ?? null;
    });
    const seen = (kindCounts.today ?? 0) > 0 || (kindCounts.week ?? 0) > 0;
    if (ALWAYS_SHOWN.includes(kind) || seen) byKind.push({ kind, label: SALE_KIND_LABEL[kind], counts: kindCounts });
  }

  return {
    windows,
    stages,
    skippedPayers: counts((key) => sets[key].skipped),
    sales: {
      starters: counts((key) => {
        const rows = windowRows(key);
        return rows ? new Set(rows.filter(checkoutOpened).map(paymentHolder)).size : null;
      }),
      paid: counts((key) => paidRows(key)?.length ?? null),
      byKind,
      // Denetim kaydı okunamadıysa "okunamadı": yalnız ödeyen ≠ hakkın sahibi sayılsa bağlantıyla ödeme eksik kalırdı.
      parent: counts((key) => (input.parentOids ? (paidRows(key)?.filter((row) => parentPayment(row, input.parentOids)).length ?? null) : null)),
    },
  };
}
