import { applyDisplayDates, pathOriginDay, daysBetween, type DatedPathNode } from "@/lib/learning/path-dates";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { withoutOutcomeCode } from "@/lib/learning/path-labels";
import { heaviestSection, type DocumentMap } from "@/lib/documents/document-map";
import { examPrepNodeHref } from "@/lib/learning/exam-prep-hrefs";
import type { StudentMemory } from "@/lib/learning/student-memory/summary";

/*
  Öğrenci Dosyası (PROMPT-V2 §3, PR-2), 15 Kasım 2026: öğrencinin KENDİ kayıtlarından ≤300 jetonluk özet. Saf: girdi
  yükleyiciden (`dossier-load.ts`) gelir, burada yalnız seçilir, sayılır ve cümleye dökülür. Her satır bir kayda bağlıdır
  (`href`); kayıt yoksa satır da yoktur ("daha önce takılmıştın" yalnız eşleşen kayıtla). Ruh hali, sağlık ve kişilik
  çıkarımı YOK; yalnız çalışma kayıtları. Model çağrısı yok.
*/

export type DossierSource = "mistakes" | "plan" | "reviews" | "exam" | "documents" | "streak";

export type DossierLine = {
  key: string;
  source: DossierSource;
  /** Öğrenciye görünen satır ("Neye baktım"). */
  text: string;
  /** Kaydın açıldığı yer: oradan silinen bilgi bir sonraki okumada yok olur. */
  href: string;
  /** Kaynağın adı ("Yanlışlarım", "Hazırlık planı" …). */
  sourceLabel: string;
};

/** M4 süreç çipi: gerçekten yapılan bir okumanın adı ve bulduğu kayıt sayısı. */
export type DossierCheck = { source: DossierSource; label: string; count: number };

export type Dossier = {
  lines: DossierLine[];
  checks: DossierCheck[];
  /** Hiçbir kayıt yok: öğretmen dürüstçe "seni daha tanımıyorum" der. */
  empty: boolean;
  /** Öğretmen istemine giden blok (en çok ~1.200 karakter ≈ 300 jeton); kayıt yoksa boş. */
  promptBlock: string;
  /** Son belgenin haritası henüz yok (PR-3): çağıran arka planda hesaplatır. */
  pendingMapDocumentId: string | null;
  /** Yönlendiricinin (PR-4) okuduğu yapılandırılmış sinyaller; satırlarla aynı kayıtlardan. */
  signals: DossierSignals;
  /**
   * Faz 11 (öğrenci bağlamı, `src/lib/tutor/student-context.ts`): aynı okumanın ham parçaları; bağlam kurucusu ikinci kez
   * sorgu atmasın diye dosyayla birlikte önbellekte durur. Öğrenciye gösterilmez.
   */
  preps: DossierPrepRef[];
  memory: StudentMemory | null;
  /** Son belgenin haritasından notun kendi kuralları ve formülleri (istem bloğundaki satırlar). */
  noteLines: string[];
};

/** Hazırlığın bağlam kurucusuna giden kısa hâli (kimlik, ad, sınav tarihi, hedef puan). */
export type DossierPrepRef = {
  id: string;
  title: string;
  examDate: string | null;
  daysLeft: number | null;
  targetScore: number | null;
};

/** Her sinyal gerçek bir kayda ve onu açan bir yere (`href`) bağlı; yoksa null ya da boş. */
export type DossierSignals = {
  reviews: { count: number; href: string } | null;
  weak: { label: string; count: number; href: string }[];
  behind: { topic: string; days: number; href: string; minutes: number | null; prepTitle: string; examDaysLeft: number | null }[];
  exam: { title: string; daysLeft: number; href: string } | null;
  nextStep: { title: string; href: string; minutes: number | null } | null;
  heavySection: { title: string; documentName: string; from: number; to: number } | null;
};

export type DossierPrep = {
  id: string;
  title: string;
  examDate: string | null;
  createdAt: string | null;
  /** Hazırlığın hedef puanı (konu rozeti için); yoksa varsayılan hedef. */
  targetScore?: number | null;
  nodes: readonly {
    id: string;
    kind: string | null;
    title: string | null;
    status: string | null;
    sortOrder: number | null;
    sessionMeta: Record<string, unknown> | null;
  }[];
};

export type DossierInput = {
  today: string;
  /** Yanlışlarım: konu etiketi ve kaç kez yanlış yapıldığı (en çok yanlış önce). */
  mistakes: readonly { topicLabel: string | null; wrongCount: number }[];
  /** Öğrenme hafızasının açık yanılgıları (konu etiketiyle). */
  openMisconceptions: readonly { topicLabel: string | null }[];
  preps: readonly DossierPrep[];
  /** Bugün vadesi gelen tekrar sayıları. */
  dueReviews: { prep: number; general: number; prepId: string | null };
  documents: readonly { id: string; fileName: string; pageCount: number | null }[];
  /** Son belgenin haritası (PR-3); yoksa null, satır haritasız kurulur. */
  documentMap?: DocumentMap | null;
  streak: number | null;
  /** Öğrenme hafızası (yükleyicinin zaten okuduğu kayıt); bağlam kurucusu yeniden okumasın diye taşınır. */
  memory?: StudentMemory | null;
};

const PROMPT_LIMIT = 1200;

const clean = (text: string | null | undefined) => withoutOutcomeCode(String(text ?? "").replace(/\s+/g, " ").trim());

/** En çok tekrar eden zayıf kavramlar: aynı konuda en az iki yanlış (Yanlışlarım + açık yanılgı), en çok 3. */
export function weakConcepts(input: Pick<DossierInput, "mistakes" | "openMisconceptions">): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();
  const add = (label: string | null, count: number) => {
    const name = clean(label);
    if (!name) return;
    const key = name.toLocaleLowerCase("tr");
    const entry = counts.get(key) ?? { label: name, count: 0 };
    entry.count += Math.max(0, count);
    counts.set(key, entry);
  };
  for (const row of input.mistakes) add(row.topicLabel, row.wrongCount);
  for (const row of input.openMisconceptions) add(row.topicLabel, 1);
  return [...counts.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr"))
    .slice(0, 3);
}

/** Yolda günü geçmiş, bitmemiş en erken adım: konu adı ve kaç gün geride. Tarih hazırlık sayfasının kuralından. */
export function behindStep(
  prep: DossierPrep,
  today: string,
): { topic: string; days: number; nodeId: string; minutes: number | null } | null {
  const dated = prep.nodes
    .filter((node) => node.kind && node.kind in PLAN_NODE_META && node.status !== "hidden")
    .map((node) => ({
      id: node.id,
      kind: node.kind as PlanNodeKind,
      sortOrder: Number(node.sortOrder ?? 0),
      sessionMeta: (node.sessionMeta as DatedPathNode["sessionMeta"]) ?? null,
      status: node.status,
      title: node.title,
    }));
  const withDates = applyDisplayDates(dated, { origin: pathOriginDay(prep.createdAt), examDate: prep.examDate });
  let earliest: { topic: string; days: number; nodeId: string; minutes: number | null } | null = null;
  for (const node of withDates) {
    const date = node.sessionMeta?.calendarDate;
    if (node.status === "done" || typeof date !== "string" || date >= today) continue;
    const days = daysBetween(date, today);
    const topic = clean(node.sessionMeta?.topicTitle ?? node.title);
    if (!topic) continue;
    const minutes = Number((node.sessionMeta as { durationMinutes?: unknown } | null)?.durationMinutes);
    if (!earliest || days > earliest.days) {
      earliest = { topic, days, nodeId: node.id, minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null };
    }
  }
  return earliest;
}

function daysLeft(examDate: string | null, today: string): number | null {
  if (!examDate) return null;
  const left = daysBetween(today, examDate.slice(0, 10));
  return Number.isFinite(left) ? left : null;
}

export function buildDossier(input: DossierInput): Dossier {
  const lines: DossierLine[] = [];
  const checks: DossierCheck[] = [];

  const weak = weakConcepts(input);
  const mistakeTotal = input.mistakes.reduce((sum, row) => sum + Math.max(0, row.wrongCount), 0);
  if (input.mistakes.length) checks.push({ source: "mistakes", label: "Yanlışlarına baktı", count: input.mistakes.length });
  if (weak.length) {
    lines.push({
      key: "weak",
      source: "mistakes",
      text: `En çok takıldığın: ${weak.map((entry) => `${entry.label} (${entry.count} kez)`).join(", ")}`,
      href: "/yanlislarim",
      sourceLabel: "Yanlışlarım",
    });
  } else if (mistakeTotal > 0) {
    lines.push({
      key: "mistakes",
      source: "mistakes",
      text: `Yanlışlarımda ${input.mistakes.length} kayıt var; tekrar eden bir konu yok`,
      href: "/yanlislarim",
      sourceLabel: "Yanlışlarım",
    });
  }

  const upcoming = input.preps
    .map((prep) => ({ prep, left: daysLeft(prep.examDate, input.today) }))
    .filter((entry) => entry.left != null && entry.left >= 0)
    .sort((a, b) => (a.left ?? 0) - (b.left ?? 0))[0];
  if (upcoming) {
    checks.push({ source: "exam", label: "Sınav tarihine baktı", count: 1 });
    lines.push({
      key: "exam",
      source: "exam",
      text:
        upcoming.left === 0
          ? `${clean(upcoming.prep.title)}: sınav bugün`
          : `${clean(upcoming.prep.title)}: sınava ${upcoming.left} gün`,
      href: `/deneme-sinavlari/${upcoming.prep.id}`,
      sourceLabel: "Hazırlık",
    });
  }

  let behindCount = 0;
  const behindSignals: DossierSignals["behind"] = [];
  for (const prep of input.preps) {
    const behind = behindStep(prep, input.today);
    if (!behind) continue;
    behindCount += 1;
    const href = examPrepNodeHref(prep.id, behind.nodeId);
    behindSignals.push({
      topic: behind.topic,
      days: behind.days,
      href,
      minutes: behind.minutes,
      prepTitle: clean(prep.title),
      examDaysLeft: daysLeft(prep.examDate, input.today),
    });
    if (lines.filter((line) => line.source === "plan").length >= 2) continue;
    lines.push({
      key: `behind:${prep.id}`,
      source: "plan",
      text: `${behind.topic} ${behind.days} gün gecikti (${clean(prep.title)})`,
      href,
      sourceLabel: "Hazırlık planı",
    });
  }
  if (input.preps.length) checks.push({ source: "plan", label: "Planına baktı", count: behindCount });

  const due = input.dueReviews.prep + input.dueReviews.general;
  if (due > 0) {
    checks.push({ source: "reviews", label: "Tekrar kuyruğuna baktı", count: due });
    lines.push({
      key: "reviews",
      source: "reviews",
      text: `Bugün ${due} tekrar seni bekliyor`,
      href: input.dueReviews.prep > 0 && input.dueReviews.prepId ? `/deneme-sinavlari/${input.dueReviews.prepId}/tekrar` : "/tekrar",
      sourceLabel: "Tekrar kuyruğu",
    });
  }

  if (input.documents.length) {
    checks.push({ source: "documents", label: "Belgelerine baktı", count: input.documents.length });
    const first = input.documents[0]!;
    const pages = first.pageCount ? ` (${first.pageCount} sayfa)` : "";
    const more = input.documents.length > 1 ? ` ve ${input.documents.length - 1} belge daha` : "";
    const heavy = input.documentMap ? heaviestSection(input.documentMap) : null;
    const weighted =
      heavy && input.documentMap && input.documentMap.sections.length > 1 ? `; en ağırlıklı bölüm: ${clean(heavy.title)}` : "";
    lines.push({
      key: "documents",
      source: "documents",
      text: `Son yüklediğin: ${clean(first.fileName)}${pages}${more}${weighted}`,
      href: "/dokumanlar",
      sourceLabel: "Belgelerim",
    });
  }

  if (input.streak && input.streak >= 2) {
    lines.push({ key: "streak", source: "streak", text: `${input.streak} gündür arka arkaya çalışıyorsun`, href: "/ilerleme", sourceLabel: "Seri" });
  }

  const empty = lines.length === 0;
  // Notun kendi sayısal kuralları ve formülleri (SOURCE_NUMBER_PRIORITY): genel bilgiden önce bunlar geçerli.
  const map = input.documentMap ?? null;
  const noteLines = map
    ? [
        ...map.rules.slice(0, 3).map((rule) => `- Notun kuralı: ${rule} [Belgelerim]`),
        ...map.formulas.slice(0, 2).map((formula) => `- Notun formülü: ${formula} [Belgelerim]`),
      ]
    : [];
  const body = [...lines.map((line) => `- ${line.text} [${line.sourceLabel}]`), ...noteLines].join("\n");
  const promptBlock = empty
    ? ""
    : `ÖĞRENCİ DOSYASI (yalnız bu satırlar gerçek kayıttır; "daha önce takılmıştın" gibi bir cümleyi YALNIZ burada eşleşen ` +
      `bir kayıt varsa kur; burada olmayan geçmişi uydurma; tanı ve kişilik yorumu yapma):\n${body}`.slice(0, PROMPT_LIMIT);
  const reviewHref = lines.find((line) => line.key === "reviews")?.href ?? "/tekrar";
  const heavy = map ? heaviestSection(map) : null;
  const signals: DossierSignals = {
    reviews: due > 0 ? { count: due, href: reviewHref } : null,
    weak: weak.map((entry) => ({ ...entry, href: "/yanlislarim" })),
    behind: behindSignals.sort((a, b) => urgency(b) - urgency(a)),
    exam: upcoming && upcoming.left != null
      ? { title: clean(upcoming.prep.title), daysLeft: upcoming.left, href: `/deneme-sinavlari/${upcoming.prep.id}` }
      : null,
    nextStep: nextOpenStep(upcoming?.prep ?? input.preps[0] ?? null),
    heavySection:
      heavy && map && map.sections.length > 1 && input.documents[0]
        ? { title: clean(heavy.title), documentName: clean(input.documents[0].fileName), from: heavy.from, to: heavy.to }
        : null,
  };
  return {
    lines,
    checks,
    empty,
    promptBlock,
    pendingMapDocumentId: input.documents.length && !input.documentMap ? input.documents[0]!.id : null,
    signals,
    preps: input.preps.map((prep) => ({
      id: prep.id,
      title: clean(prep.title),
      examDate: prep.examDate,
      daysLeft: daysLeft(prep.examDate, input.today),
      targetScore: typeof prep.targetScore === "number" && Number.isFinite(prep.targetScore) ? prep.targetScore : null,
    })),
    memory: input.memory ?? null,
    noteLines,
  };
}

/** Geciken adımın aciliyeti: sınava kalan gün azaldıkça ve gecikme büyüdükçe artar (deterministik). */
export function urgency(entry: { days: number; examDaysLeft: number | null }): number {
  const exam = entry.examDaysLeft == null ? 0 : Math.max(0, 30 - Math.min(30, entry.examDaysLeft));
  return entry.days * 2 + exam;
}

/** Hazırlığın sıradaki açık adımı (kilidi açık, bitmemiş, sıra numarasıyla ilk): "yeni konu" önerisi. */
function nextOpenStep(prep: DossierPrep | null): DossierSignals["nextStep"] {
  if (!prep) return null;
  const open = [...prep.nodes]
    .filter((node) => node.status === "ready" && node.kind && node.kind in PLAN_NODE_META)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))[0];
  if (!open) return null;
  const meta = (open.sessionMeta ?? {}) as { topicTitle?: string; durationMinutes?: unknown };
  const minutes = Number(meta.durationMinutes);
  return {
    title: clean(meta.topicTitle ?? open.title) || clean(PLAN_NODE_META[open.kind as PlanNodeKind].title),
    href: examPrepNodeHref(prep.id, open.id),
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
  };
}
