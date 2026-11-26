import {
  renderMail,
  subjectPart,
  trimOrigin,
  type MailBlock,
  type RenderedMail,
} from "@/lib/email/templates/layout";
import {
  SEVERITY_LABEL,
  type AlertCandidate,
} from "@/lib/founder-cockpit/alerts";

/**
 * Kurucu alarm e-postası (Faz 13, 26 Kasım 2026). Yalnız ayarlardaki alarm adresine gider (öğrenciye asla). Sade Türkçe:
 * sorun özeti, tahmini etki, "Şimdi ne yapmalısın?" adımı ve Kurucu Kokpiti bağlantısı. Mevcut e-posta kabuğundan
 * (`renderMail`, işlem e-postası altbilgisi); her dinamik değer kabukta kaçışla basılır.
 */

export const COCKPIT_PATH = "/admin/kokpit";

export function renderFounderAlertMail(
  alert: AlertCandidate,
  origin: string,
  options: { test?: boolean } = {},
): RenderedMail {
  const base = trimOrigin(origin) || "https://cortexplus.app";
  const severity = SEVERITY_LABEL[alert.severity];
  const title = subjectPart(alert.title, 110);
  const blocks: MailBlock[] = [
    { type: "paragraph", lead: "Sorun özeti", text: alert.summary },
    { type: "paragraph", lead: "Tahmini etki", text: alert.impact },
    {
      type: "note",
      lead: "Şimdi ne yapmalısın?",
      text: alert.action,
      tone: alert.severity === "critical" ? "warm" : "info",
    },
  ];
  if (options.test) {
    blocks.unshift({
      type: "note",
      text: "Bu bir deneme e-postasıdır: alarm hattının çalıştığını gösterir, gerçek bir sorun yok.",
      tone: "info",
    });
  }
  return renderMail({
    subject: `[${severity}] ${title}`,
    preheader: subjectPart(alert.summary, 120),
    kicker: options.test
      ? "Kurucu Kokpiti · Deneme"
      : `Kurucu Kokpiti · ${severity}`,
    headline: title,
    greetingName: "",
    blocks,
    cta: { label: "Kurucu Kokpiti'ni aç", href: `${base}${COCKPIT_PATH}` },
    footer: { variant: "transactional" },
  });
}

export function testAlertCandidate(): AlertCandidate {
  return {
    key: "test",
    kind: "test",
    severity: "info",
    title: "Alarm hattı deneme e-postası",
    summary: "Kurucu Kokpiti'nden deneme e-postası gönderildi.",
    impact:
      "Etki yok. Bu e-posta geldiyse sağlık, bütçe ve vergi alarmları da bu adrese ulaşır.",
    action:
      "Bir şey yapman gerekmiyor. E-posta gelmediyse spam klasörüne ve kokpitteki alarm adresine bak.",
  };
}
