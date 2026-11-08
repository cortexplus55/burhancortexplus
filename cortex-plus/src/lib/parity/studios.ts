import type { Icon3DName } from "@/components/ui/icon-3d";
import type { ActionCode } from "@/lib/env";
import { isPlusOnlyAction } from "@/lib/billing/free-meters";

/**
 * Çalışma Stüdyosu (8 Kasım 2026, ürün sahibi: "Araçlar sekmesinin adı Çalışma Stüdyosu olsun, doğrudan bizim
 * özelliklerimizi kullanacak şekilde tasarla"). Sekmenin ana bölümü bu sekiz stüdyo; her kart kendi stüdyosunu açar.
 * Kartlardaki iki kısa bilgi bugün çalışan özelliği anlatır (söz verme yok). Ücretsiz hesapta yalnız
 * `PLUS_ONLY_ACTIONS` işleri "Plus" rozeti taşır; açık liste, fiyattan türetilmez.
 */
export type Studio = {
  id: string;
  title: string;
  blurb: string;
  facts: readonly [string, string];
  href: string;
  icon: Icon3DName;
  /** Kartın vurgu rengi (koyu zeminde okunur ton). Sarı yok: sarı yalnız marka ve Plus. */
  accent: string;
  /** Büyük kart (masaüstünde iki sütun). */
  featured?: boolean;
  action?: ActionCode;
};

export const STUDIOS: readonly Studio[] = [
  {
    id: "soru-coz",
    title: "Fotoğraftan Çözüm",
    blurb: "Takıldığın sorunun fotoğrafını çek ya da yaz; adım adım, anlaşılır bir çözüm al.",
    facts: ["Her dersten soru", "Adım adım çözüm"],
    href: "/soru-coz",
    icon: "alistirma",
    accent: "#5b6cff",
    featured: true,
  },
  {
    id: "quiz",
    title: "Konu Testi",
    blurb: "Konudan ya da kendi belgenden test hazırla; her şıkkın neden doğru ya da yanlış olduğunu gör.",
    facts: ["Konudan ya da belgenden", "Her şık açıklanır"],
    href: "/studio/quiz",
    icon: "konu-testi",
    accent: "#9b6bff",
    featured: true,
  },
  {
    id: "flashcard",
    title: "Kartlar",
    blurb: "Belgenden kart üret, aralıklı tekrarla kalıcı ezberle.",
    facts: ["Belgenden kart", "Aralıklı tekrar"],
    href: "/studio/flashcard",
    icon: "kartlar",
    accent: "#2fc7b6",
  },
  {
    id: "dogru-yanlis",
    title: "Doğru / Yanlış",
    blurb: "Hızlı kontrol; yanlış cümlenin doğrusu hemen yanında.",
    facts: ["Hızlı kontrol", "Doğrusu yanında"],
    href: "/studio/dogru-yanlis",
    icon: "dogru-yanlis",
    accent: "#3fc56b",
  },
  {
    id: "podcast",
    title: "Podcast",
    blurb: "Notunu dinleyerek tekrar et; yolda, otobüste, yürürken.",
    facts: ["İki sesli ya da tek sesli", "Belgenden ya da konudan"],
    href: "/studio/podcast",
    icon: "podcast",
    accent: "#ff5d8f",
    action: "PODCAST_GENERATE",
  },
  {
    id: "sozlu",
    title: "Sözlü Sınav",
    blurb: "Soruları cevapla, cevabın ölçüt ölçüt puanlansın.",
    facts: ["Sesli ya da yazılı", "Anında puan"],
    href: "/studio/sozlu",
    icon: "sozlu",
    accent: "#ff7a59",
    action: "ORAL_EXAM_GENERATE",
  },
  {
    id: "yazili",
    title: "Yazılı Deneme",
    blurb: "Gerçek sınav düzeninde dene; notunu ve her sorunun incelemesini gör.",
    facts: ["Çoktan seçmeli + açık uçlu", "Notlanır ve incelenir"],
    href: "/studio/yazili",
    icon: "yazili",
    accent: "#36b6ff",
    action: "PRACTICE_EXAM_GENERATE",
  },
  {
    id: "anlat",
    title: "Anlatarak Öğren",
    blurb: "Konuyu sen anlat; nerede tökezlediğini birlikte görelim.",
    facts: ["Sen anlat", "Eksiğini gösterir"],
    href: "/studio/anlat",
    icon: "ogretmen",
    accent: "#c46bff",
  },
];

/** Ücretsiz hesapta bu stüdyo Plus rozeti taşır mı. */
export function studioNeedsPlus(studio: Studio, freeAccount: boolean): boolean {
  return freeAccount && Boolean(studio.action && isPlusOnlyAction(studio.action));
}
