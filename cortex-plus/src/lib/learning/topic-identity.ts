/**
 * Konu kimliği — TEK kural (30 Ekim 2026).
 *
 * Aynı konunun iki kimliği var: hazırlığın konu satırı (`exam_prep_topics.id`) ve belgeli hazırlıkta belgeden gelen
 * konu düğümü (`exam_prep_topics.document_topic_node_id`). Yol düğümünün `session_meta.topicId` alanı belgeli
 * hazırlıkta ikincisini tutar (canlıda konu kimliği taşıyan 1.851 düğümün 1.830'u). Konuyu yalnız birinci kimlikle
 * karşılaştıran kod sessizce "eşleşmedi" deyip ada düşüyordu; ad eşleşmezse de başka konunun düğümü açılıyordu
 * (30 Ekim canlı turu: "Enflasyon Türleri" için seçilen sözlü "Para Politikası"nın adımına yazıldı).
 *
 * Kural:
 * 1. İki tarafta da kimlik varsa kimlik karar verir: kimliklerden biri ortaksa aynı konu, değilse farklı konu.
 * 2. Kimlik bir tarafta yoksa ad: önce birebir (büyük/küçük harf ve boşluk yok sayılır), sonra "Stokiyometri" ile
 *    "Stokiyometri: sınırlayıcı bileşen" gibi uzantı (`topicLabelsMatch`).
 *
 * Kanıt ve hâkimiyet konuyu adıyla (`topic_key`) tutar (şema değişmez): o yazımlar ve okumalar adı `createTopicIndex`
 * ile hazırlığın konu satırına bağlar.
 *
 * Yaprak modül (içe aktarma yok): istemci de sunucu da okur.
 */

export type TopicIdentity = {
  /** `exam_prep_topics.id` ya da düğümün `session_meta.topicId`'si (hangisi olduğu bilinmiyorsa da buraya). */
  id?: string | null;
  /** `exam_prep_topics.document_topic_node_id`. */
  documentTopicNodeId?: string | null;
  label?: string | null;
};

/** Düğümün `session_meta`'sından konu: `topicId` iki kimlikten biri olabilir. */
export type TopicMetaLike = { topicId?: unknown; topicTitle?: unknown } | null | undefined;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Ad karşılaştırma anahtarı: kırpılmış, Türkçe küçük harf, tek boşluk. */
export function topicLabelKey(label: string | null | undefined): string {
  return (label ?? "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

/**
 * "Stokiyometri" ile "Stokiyometri: sınırlayıcı bileşen" aynı konudur. Başka bir konu başlığı (Gazlar) eşleşmez.
 * Yalnız ad: kimlik bilinen yerde `sameTopic` kullanılır.
 */
export function topicLabelsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = topicLabelKey(left);
  const b = topicLabelKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (!longer.startsWith(shorter)) return false;
  const next = longer[shorter.length] ?? "";
  return /[\s:–—\-,|/]/.test(next);
}

export function topicIdsOf(topic: TopicIdentity | null | undefined): string[] {
  if (!topic) return [];
  return [...new Set([text(topic.id), text(topic.documentTopicNodeId)].filter(Boolean))];
}

/** Düğüm metasını kimliğe çevirir. */
export function topicFromMeta(meta: TopicMetaLike): TopicIdentity {
  return { id: text(meta?.topicId) || null, label: text(meta?.topicTitle) || null };
}

/** İki konu aynı mı — kimlik önce, ad yalnız kimlik bir tarafta yoksa. */
export function sameTopic(a: TopicIdentity | null | undefined, b: TopicIdentity | null | undefined): boolean {
  if (!a || !b) return false;
  const left = topicIdsOf(a);
  const right = topicIdsOf(b);
  if (left.length && right.length) return left.some((id) => right.includes(id));
  return topicLabelsMatch(a.label, b.label);
}

/** Düğüm bu konunun mu (düğüm metası ↔ konu satırı). */
export function nodeOnTopic(meta: TopicMetaLike, topic: TopicIdentity | null | undefined): boolean {
  return sameTopic(topicFromMeta(meta), topic);
}

/**
 * İçerik birden çok konuyu mu kapsıyor (sözlüde "Tüm sınav" ya da birden çok konu seçildi): soru başına konu yok, tek
 * konuya kanıt, yanılgı ya da tekrar yazılmaz (Paket I #8 kuralı; 30 Ekim 2026'da çoklu seçime de uygulandı).
 */
export function contentSpansTopics(payload: unknown): boolean {
  const scope = (payload as { scope?: unknown } | null)?.scope;
  return scope === "all" || scope === "topics";
}

/** İçeriğin sorduğu tek konu (`testedTopic`); birden çok konuyu kapsıyorsa ya da damga yoksa null. */
export function contentTestedTopic(payload: unknown): string | null {
  if (contentSpansTopics(payload)) return null;
  return text((payload as { testedTopic?: unknown } | null)?.testedTopic) || null;
}

/** Kimlik süzgeci: PostgREST süzgecine ve eşleştirmeye yalnız güvenli kimlik girer. */
export function safeTopicIds(values: unknown, max = 20): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(text).filter((id) => /^[0-9A-Za-z_-]{1,64}$/.test(id)))].slice(0, max);
}

export type TopicRowLike = { id: string; label: string; documentTopicNodeId?: string | null };

export type TopicIndex<T extends TopicRowLike> = {
  rows: readonly T[];
  /**
   * Kimlik ya da ad hangi konu satırı: önce kimlik (iki kimlikten biri), sonra birebir ad, sonra tek bir satırın
   * uzantı eşleşmesi. Birden çok satır uzantıyla eşleşirse null (tahmin yok).
   */
  rowFor(ref: TopicIdentity | string | null | undefined): T | null;
  /** Kanıt / hâkimiyet anahtarının konu satırı (anahtar addır). */
  rowForKey(key: string | null | undefined): T | null;
};

export function createTopicIndex<T extends TopicRowLike>(rows: readonly T[]): TopicIndex<T> {
  const byId = new Map<string, T>();
  const byKey = new Map<string, T>();
  for (const row of rows) {
    for (const id of topicIdsOf({ id: row.id, documentTopicNodeId: row.documentTopicNodeId ?? null })) {
      if (!byId.has(id)) byId.set(id, row);
    }
    const key = topicLabelKey(row.label);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  const byLabel = (label: string | null | undefined): T | null => {
    const key = topicLabelKey(label);
    if (!key) return null;
    const exact = byKey.get(key);
    if (exact) return exact;
    const near = rows.filter((row) => topicLabelsMatch(row.label, key));
    return near.length === 1 ? near[0]! : null;
  };
  return {
    rows,
    rowFor(ref) {
      if (ref == null) return null;
      if (typeof ref === "string") return byId.get(ref.trim()) ?? byLabel(ref);
      for (const id of topicIdsOf(ref)) {
        const hit = byId.get(id);
        if (hit) return hit;
      }
      return byLabel(ref.label);
    },
    rowForKey(key) {
      return byLabel(key);
    },
  };
}
