import tr from "@/i18n/messages/tr.json";
import en from "@/i18n/messages/en.json";

const catalogs = { tr, en } as const;

export type Locale = keyof typeof catalogs;

export function getMessages(locale: Locale = "tr") {
  return catalogs[locale] ?? catalogs.tr;
}
