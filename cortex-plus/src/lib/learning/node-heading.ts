import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { topicOnlyLabel, withoutGradeParts } from "@/lib/learning/path-labels";
import { ALL_TOPICS_KINDS, ALL_TOPICS_LABEL } from "@/lib/learning/prep-wide-target";

/**
 * Yol adımının öğrenciye görünen adı. Hazırlık sayfasının "Sıradaki" kartı ve Sınavlar listesindeki kart
 * (8 Kasım 2026) aynı adı yazsın diye tek yerde.
 */
export function nodeHeading(node: {
  kind: PlanNodeKind;
  title?: string | null;
  sessionMeta?: { topicTitle?: string | null } | null;
}): string {
  const raw = node.title || PLAN_NODE_META[node.kind].title;
  // "9. Sınıf · Konu" kartta "9. Sınıf" yazıyordu (2 Kasım 2026): sınıf parçası başlık olmaz.
  const parts = withoutGradeParts(raw.split(" · ").map((part) => part.trim()));
  // Kavram birimli ders: "Konu · Ders 2/9: Hukukun kaynakları · dosya s.…" → dersin
  // kendi adı. kıyas ürünü kartta ana konuyu değil dersin adını yazar (3 Ekim 2026).
  const unit = parts.find((part) => /^Ders \d+\/\d+: /.test(part));
  if (unit) return unit.replace(/^Ders \d+\/\d+: /, "");
  const heading = parts[0] || raw;
  // Bütün konuları kapsayan adım (son kontrol, yazılı deneme, Hazırsın) devraldığı 1. konunun adını yazmaz
  // (30 Ekim 2026, Paket I #8): kart "1. konu" derken sorular bütün konulardan geliyordu.
  if (ALL_TOPICS_KINDS.has(node.kind)) return heading === PLAN_NODE_META[node.kind].title ? `${heading} · ${ALL_TOPICS_LABEL}` : heading;
  // Başlık yalnız etkinliğin türüyse ("Podcast Dinle") konunun adı yazılır; tür zaten
  // etiketinde. kıyas ürününde "SIRADAKİ · AKILLI METİN · Büyüme Eğrileri…" (18 Ekim 2026).
  const topic = node.sessionMeta?.topicTitle?.trim();
  return topic && heading === PLAN_NODE_META[node.kind].title ? topicOnlyLabel(topic) : heading;
}
