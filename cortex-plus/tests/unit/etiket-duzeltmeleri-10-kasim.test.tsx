import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSlideDeck, pageCountLabel } from "@/lib/documents/page-count-label";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";
import { nodeHeading } from "@/lib/learning/node-heading";
import { STUDY_TOOLS } from "@/lib/learning/study-tools";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/*
  10 Kasım 2026, canlı denetim: etkinliği kapatan × "Oturumdan çık" diyordu (öğrenci hesabından çıkacağını sanıyordu),
  sunu dosyası "N sayfa" yazıyordu, çoktan seçmeli soru-cevap adımı "AI öğretmen" adıyla sohbetle karışıyordu,
  doğrulanmış e-posta şeridi öbür sayfalarda yeniden çıkıyordu.
*/

describe("etiketler", () => {
  it("etkinliği kapatan düğme hesaptan çıkış gibi okunmaz", () => {
    const chrome = read("src/components/parity/exam-node/chrome.tsx");
    expect(chrome).toContain('aria-label="Etkinliği kapat" title="Etkinliği kapat"');
    expect(chrome).not.toContain("Oturumdan çık");
  });

  it("sunu dosyasında birim slayt, öbür belgelerde sayfa", () => {
    expect(pageCountLabel("Hafta 3 Sunumu.pptx", 7)).toBe("7 slayt");
    expect(pageCountLabel("eski-sunu.PPT", 12)).toBe("12 slayt");
    expect(pageCountLabel("Ders Notu.pdf", 7)).toBe("7 sayfa");
    expect(pageCountLabel("ozet.docx", 3)).toBe("3 sayfa");
    expect(pageCountLabel(null, 4)).toBe("4 sayfa");
    expect(isSlideDeck("pptx hakkında not.pdf")).toBe(false);
    expect(read("src/app/dokumanlar/page.tsx")).toContain("pageCountLabel(document.file_name, document.page_count)");
    expect(read("src/app/dokumanlar/[documentId]/page.tsx")).toContain("pageCountLabel(doc.file_name, doc.page_count)");
  });

  it("çoktan seçmeli soru-cevap adımı sohbetteki AI öğretmenle aynı adı taşımaz", () => {
    expect(PLAN_NODE_META.qa.title).toBe("Soru-Cevap Turu");
    const tool = STUDY_TOOLS.find((item) => item.id === "qa")!;
    expect(tool.title).toBe("Soru-cevap turu");
    expect(tool.title).not.toMatch(/AI öğretmen/i);
    // Eski kayıttaki ad bugünkü adla okunur; konusu varsa kartta konunun adı yazar.
    expect(nodeHeading({ kind: "qa", title: "AI öğretmenle Soru-Cevap" })).toBe("Soru-Cevap Turu");
    expect(nodeHeading({ kind: "qa", title: "AI öğretmenle Soru-Cevap", sessionMeta: { topicTitle: "Üslü Sayılar" } })).toBe("Üslü Sayılar");
  });
});

describe("e-posta doğrulama şeridi", () => {
  it("kabuk yükleyicisi bayat belirteç bayrağını taze kullanıcıyla teyit eder", () => {
    const props = read("src/lib/student/parity-shell-props.ts");
    expect(props).toMatch(/if \(emailUnverified\) \{\s*const fresh = await supabase\.auth\.getUser\(\)/);
    expect(props).toContain("emailUnverified = emailUnverifiedFromMetadata(fresh.data.user.app_metadata)");
  });

  it("şerit bayat belirteci bir kez tazeler", () => {
    const banner = read("src/components/auth/email-verify-banner.tsx");
    expect(banner).toContain("if (fresh.user && !still && data.session?.user.app_metadata?.email_unverified === true");
  });
});
