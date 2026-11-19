import { FREE_CHAT_PER_DAY, FREE_PHOTO_PER_MONTH } from "@/lib/billing/free-meters";
import { FREE_PAGE_TOTAL, PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { PLAN_ALLOWANCES, planWorkEquivalent, planWorkLine } from "@/lib/credits/price-table";

/**
 * Bütün kamu ve yasal sayfaların TEK kota metni (Faz 5 §4, 19 Kasım 2026, Burhan'ın kararı).
 *
 * Ana sayfa (`/`), `/fiyatlandirma`, `/pay`, `/ozellikler`, `/yardim` ve `/on-bilgilendirme` (aynı metni okuyan
 * Mesafeli Satış Sözleşmesi dahil) planların "ne kadar iş" karşılığını yalnız bu sabitten okur. Sayılar elle yazılmaz:
 * dönem hakkı `PLAN_ALLOWANCES`ten (kaynak `plans.monthly_allowance`), karşılık `planWorkEquivalent`ten (fiyat
 * tablosundaki ders / test / sohbet kredisi) hesaplanır. Hak ya da fiyat tablosu değişirse bütün sayfalar birlikte
 * değişir; bekçi test (`plan-copy.test.ts`) sayfalarda eski metin kalmadığını da tutar.
 *
 * Bugünkü değerler: Plus ~200 ders / 310 test / 4.350 sohbet; Sınav Haftası ~115 ders / 178 test / 2.500 sohbet;
 * Sigma ~660 ders / 1.035 test / 14.500 sohbet. İstemci de okuduğu için `server-only` yok.
 */

export type PlanCopyId = "plus" | "week" | "sigma";

export type PlanCopy = {
  id: PlanCopyId;
  /** Kartta ve sözleşmede görünen ad. */
  name: string;
  /** Dönemin cümle içi adı: "ay" ya da "7 gün". */
  period: "ay" | "7 gün";
  /** Dönem hakkı (kredi); yalnız hesap için, ekranda yazmaz. */
  allowance: number;
  /** Yaklaşık iş karşılığı (ders en yakın 5'e, test ve sohbet aşağı yuvarlanmış). */
  work: { lessons: number; tests: number; chats: number };
  /** "~200 ders / 310 test / 4.350 sohbet" */
  line: string;
  /** "Ayda ~200 ders / 310 test / 4.350 sohbet" ya da "7 günde ~115 ders / …" */
  periodLine: string;
};

/** Haftalık Plus'ın satıştaki adı (ana sayfa, fiyat sayfası ve sözleşme aynı adı kullanır). */
export const WEEKLY_PLAN_NAME = "Sınav Haftası (7 Günlük Plus)";

function plan(id: PlanCopyId, name: string, period: PlanCopy["period"], allowance: number): PlanCopy {
  const line = planWorkLine(allowance);
  return {
    id,
    name,
    period,
    allowance,
    work: planWorkEquivalent(allowance),
    line,
    periodLine: `${period === "ay" ? "Ayda" : "7 günde"} ${line}`,
  };
}

/** "A, B ve C". */
function listWithAnd(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("tr") + text.slice(1);
}

const PLUS = plan("plus", "Plus", "ay", PLAN_ALLOWANCES.plusMonthly);
const WEEK = plan("week", WEEKLY_PLAN_NAME, "7 gün", PLAN_ALLOWANCES.plusWeekly);
const SIGMA = plan("sigma", "Sigma", "ay", PLAN_ALLOWANCES.sigmaMonthly);

/** İlk ders döngüsünün kısa adları (yoldaki sırayla); `/sinav-hazirligi` alt çağrısı bunları okur. */
export const FIRST_CYCLE_SHORT_STEPS = ["Ders", "Kartlar", "D/Y", "Konu Testi"] as const;

export const PLAN_MARKETING_COPY = {
  plus: PLUS,
  week: WEEK,
  sigma: SIGMA,
  /** Sıralı liste (ucuzdan pahalıya değil, sayfalardaki sırayla: Plus, Sınav Haftası, Sigma). */
  plans: [PLUS, WEEK, SIGMA] as const,
  free: {
    /** `/sinav-hazirligi` alt çağrısı (Faz 5 §4.1, harfiyen). */
    firstCycleCta: `İlk hazırlığının 1. ders döngüsü (${listWithAnd(FIRST_CYCLE_SHORT_STEPS)}) süresiz ücretsiz`,
    chatPerDay: FREE_CHAT_PER_DAY,
    photoPerMonth: FREE_PHOTO_PER_MONTH,
    pageTotal: FREE_PAGE_TOTAL,
  },
  /** Yardım SSS'sindeki plan cevabı: üç planın karşılığı (Sigma dahil). */
  helpPlansAnswer:
    `Plus: ${PLUS.periodLine.replace(/^A/, "a")}. ${WEEK.name}: ${WEEK.periodLine}. Sigma: ${SIGMA.periodLine.replace(/^A/, "a")}. ` +
    "Sayılar yaklaşıktır; hepsi aynı aylık hakkın farklı işlerde nasıl harcandığını gösterir.",
  /**
   * Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'nin "Hizmetin konusu" maddesi. Eski metin ücretsiz hesapta
   * "haftalık ders" sınırı yazıyordu; o sınır 11 Kasım 2026'da kalktı (ücretsiz hesap yalnız ilk dersi açar).
   */
  legalUsage:
    "Hizmet, kullanım hakkı üzerinden sunulur. Ücretli planlarda dönem için tanımlı hak işlemlerde harcanır ve kalan hak yüzde olarak gösterilir. " +
    `Dönem hakkının yaklaşık karşılığı: Plus ${PLUS.periodLine.replace(/^A/, "a")}; ${WEEK.name} ${WEEK.periodLine}; Sigma ${SIGMA.periodLine.replace(/^A/, "a")}. ` +
    `Ücretsiz hesapta ilk hazırlığın ilk ders döngüsü (ders, kartlar, doğru/yanlış ve konu testi) süre sınırı olmadan açıktır; ayrıca günde ${FREE_CHAT_PER_DAY} sohbet mesajı ve ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü hakkı vardır. ` +
    `${capitalize(listWithAnd([...PLUS_ONLY_FEATURES.map((item) => item.toLocaleLowerCase("tr")), "sesli kullanım"]))} ücretli planlarda sunulur.`,
} as const;

/** Planın kimliğinden kopyası. */
export function planCopy(id: PlanCopyId): PlanCopy {
  return PLAN_MARKETING_COPY[id];
}

/**
 * Hiçbir kamu sayfasında kalmaması gereken eski kota metinleri (Faz 5 §4.2). Bekçi test sayfaların çizimini ve bu
 * dosyanın okuduğu kaynakları bu listeye karşı tarar.
 */
export const RETIRED_QUOTA_PHRASES = ["240 ders", "2.400 mesaj", "20.000 mesaj", "2.000 ders", "720 test", "haftalık ders sınırlı", "Ücretsiz hesapta haftalık ders"] as const;
