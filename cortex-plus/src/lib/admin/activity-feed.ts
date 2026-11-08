import { ACTION_LABELS } from "@/lib/admin/labels";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/**
 * Kullanıcı etkinlikleri akışı (8 Kasım 2026, ürün sahibi: "kullanıcıların ne zaman girip ne işlem yaptıklarını
 * görebileceğim kapsamlı bir ekran"). Saf kısım: satırları tek tip olaya çevirir, sıralar, özetler. Okuma
 * `activity-load.ts`'te. İçerik gösterilmez (mesaj metni, belge metni, cevap yok): yalnız ne yaptığı ve ne zaman.
 */
export type ActivityCategory = "giris" | "calisma" | "hazirlik" | "belge" | "yapay-zeka" | "deneme" | "odeme" | "destek";

export const ACTIVITY_CATEGORIES: { id: ActivityCategory; label: string }[] = [
  { id: "giris", label: "Giriş" },
  { id: "calisma", label: "Yol etkinliği" },
  { id: "hazirlik", label: "Hazırlık" },
  { id: "belge", label: "Belge" },
  { id: "yapay-zeka", label: "Sohbet ve araçlar" },
  { id: "deneme", label: "Deneme sınavı" },
  { id: "odeme", label: "Ödeme ve abonelik" },
  { id: "destek", label: "Destek ve geri bildirim" },
];

export type ActivityEvent = {
  /** Sıralama ve tekilleştirme için kararlı kimlik. */
  key: string;
  at: string;
  userId: string;
  category: ActivityCategory;
  label: string;
  detail?: string | null;
};

const DEVICE_PATTERNS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/i, "iPhone/iPad"],
  [/Android/i, "Android"],
  [/Windows/i, "Windows"],
  [/Macintosh|Mac OS X/i, "Mac"],
  [/Linux/i, "Linux"],
];
const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Instagram/i, "Instagram içi tarayıcı"],
  [/FBAN|FBAV/i, "Facebook içi tarayıcı"],
  [/Edg\//i, "Edge"],
  [/OPR\//i, "Opera"],
  [/Chrome\//i, "Chrome"],
  [/Firefox\//i, "Firefox"],
  [/Safari\//i, "Safari"],
];

/** "Mozilla/5.0 (iPhone …) … Safari" → "iPhone/iPad · Safari". Ham tarayıcı imzası gösterilmez. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const device = DEVICE_PATTERNS.find(([re]) => re.test(ua))?.[1] ?? "Bilinmeyen cihaz";
  const browser = BROWSER_PATTERNS.find(([re]) => re.test(ua))?.[1];
  return browser ? `${device} · ${browser}` : device;
}

/** Arka planda çalışan işler (önceden yazım, havuz, kalite örneği) öğrencinin yaptığı bir şey değil. */
const BACKGROUND_ACTION = /PREFETCH|SHARED|JUDGE|QUALITY|SAMPLE|OUTLINE|EMBED|ANALYSIS/i;

export function isUserAction(actionCode: string): boolean {
  return !BACKGROUND_ACTION.test(actionCode);
}

export function aiActionLabel(actionCode: string): string {
  return ACTION_LABELS[actionCode] ?? "Yapay zekâ işlemi";
}

export function nodeKindLabel(kind: string | null | undefined): string {
  if (kind && kind in PLAN_NODE_META) return PLAN_NODE_META[kind as PlanNodeKind].title;
  return "Etkinlik";
}

export function scoreText(score: number | null | undefined, total: number | null | undefined): string | null {
  if (typeof score !== "number" || typeof total !== "number" || total <= 0) return null;
  return `${score}/${total} · %${Math.round((score / total) * 100)}`;
}

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  pending: "ödeme sayfasını açtı",
  paid: "ödedi",
  failed: "ödeme başarısız",
  refunded: "iade edildi",
};

export function paymentText(status: string, amountKurus: number | null | undefined, planName: string | null | undefined): string {
  const amount = typeof amountKurus === "number" ? `${(amountKurus / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺` : null;
  return [planName ?? "Plan", PAYMENT_STATUS_TEXT[status] ?? status, amount].filter(Boolean).join(" · ");
}

/** En yeni üstte; aynı anahtar bir kez. */
export function mergeEvents(groups: readonly (readonly ActivityEvent[])[], limit: number): ActivityEvent[] {
  const seen = new Set<string>();
  const all: ActivityEvent[] = [];
  for (const group of groups) {
    for (const event of group) {
      if (seen.has(event.key)) continue;
      seen.add(event.key);
      all.push(event);
    }
  }
  return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

export type ActivitySummary = {
  activeUsers: number;
  logins: number;
  completed: number;
  aiActions: number;
  uploads: number;
  paid: number;
  byCategory: Record<ActivityCategory, number>;
  topUsers: { userId: string; events: number; lastAt: string }[];
};

export function summarize(events: readonly ActivityEvent[]): ActivitySummary {
  const byCategory = Object.fromEntries(ACTIVITY_CATEGORIES.map((c) => [c.id, 0])) as Record<ActivityCategory, number>;
  const users = new Map<string, { events: number; lastAt: string }>();
  let logins = 0;
  let completed = 0;
  let aiActions = 0;
  let uploads = 0;
  let paid = 0;
  for (const event of events) {
    byCategory[event.category] += 1;
    const user = users.get(event.userId);
    users.set(event.userId, {
      events: (user?.events ?? 0) + 1,
      lastAt: !user || event.at > user.lastAt ? event.at : user.lastAt,
    });
    if (event.category === "giris") logins += 1;
    if (event.key.startsWith("done:") || event.key.startsWith("exam-done:")) completed += 1;
    if (event.category === "yapay-zeka") aiActions += 1;
    if (event.category === "belge") uploads += 1;
    if (event.key.startsWith("pay:") && event.label.includes("ödedi")) paid += 1;
  }
  const topUsers = [...users.entries()]
    .map(([userId, info]) => ({ userId, ...info }))
    .sort((a, b) => b.events - a.events || (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, 12);
  return { activeUsers: users.size, logins, completed, aiActions, uploads, paid, byCategory, topUsers };
}

/** İstanbul günü başlığı ("8 Kasım Pazar"); akış gün gün bölünür. */
export function istanbulDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" });
}

export function istanbulTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
}

export const WINDOW_OPTIONS = [1, 7, 30] as const;
export type WindowDays = (typeof WINDOW_OPTIONS)[number];

export function parseWindow(value: string | undefined): WindowDays {
  const n = Number(value);
  return (WINDOW_OPTIONS as readonly number[]).includes(n) ? (n as WindowDays) : 7;
}

export function parseCategory(value: string | undefined): ActivityCategory | null {
  return ACTIVITY_CATEGORIES.some((c) => c.id === value) ? (value as ActivityCategory) : null;
}
