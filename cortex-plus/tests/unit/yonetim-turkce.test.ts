import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { adminNavItem } from "@/lib/admin/nav";
import {
  decisionProviderLabel,
  difficultyLabel,
  generationKindLabel,
  learningActionLabel,
  promptKeyLabel,
  shortId,
  statusLabel,
  topicStatusLabel,
} from "@/lib/admin/status-labels";

/*
  Yönetim paneli %100 Türkçe (6 Kasım 2026).

  Bekçi, `src/app/admin/**` ve `src/components/admin/**` altındaki .tsx dosyalarında EKRANDA GÖRÜNEN metni okur
  (TypeScript sözdizimi ağacıyla, düz metin taraması değil): JSX metni; görünen özniteliklerin dizesi (`title`,
  `aria-label`, `placeholder`, `desc`, `label`, `alt` …, sınıf, adres, anahtar, ton gibi kod öznitelikleri hariç);
  JSX ifadesindeki dizeler (koşullu dallar, `columns={[…]}` dizisi, şablon metni); `toast.*` ve `setX(…)` ile
  ekrana yazılan iletiler; nesnelerde `title / label / desc / hint / message / error / name / definition` değerleri.
  Kod tanımlayıcıları, içe aktarma yolları, karşılaştırmalar (`=== "pending"`) ve fonksiyon argümanları
  (`decide("approved")`) taranmaz.

  İki parça:
  1. KESİN: bu PR'ın düzelttiği sayfalar ve bileşenler. Yasak terim çıkarsa test düşer.
  2. BÜTÜN AĞAÇ: aynı tarama bütün /admin ağacında; başka PR'larda düzelecek dosyalar aşağıdaki
     `PENDING_OTHER_PRS` listesiyle şimdilik hariç. O PR'lar birleşince ana oturum listeyi boşaltır
     (listedeki bir dosya silinir ya da taşınırsa test bunu söyler).

  Ters tırnakla işaretli kod parçası (`node scripts/…`), BÜYÜK_HARFLİ ortam değişkeni adı ve dosya adı
  terim sayılmaz; çıplak `snake_case` veritabanı adı sayılır.
*/

const ROOT = process.cwd();

/** Yasak İngilizce terimler (büyük/küçük harf duyarsız, tam sözcük). */
const FORBIDDEN = [
  "verified",
  "stale",
  "rejected",
  "pending",
  "approved",
  "audit log",
  "feature flags?",
  "rate limit",
  "spend cap",
  "dashboard",
  "settings",
  "user_id",
  "prep_id",
  "save",
  "cancel",
  "delete",
  "loading",
  "error",
  "status",
  "actions?",
  "submit",
  "debug",
  "prompts?",
  "fallback",
  "provider",
  "metrics?",
  "circuit",
  "shadow",
  "flags?",
  "global",
  "mastery",
  "sessions?",
  "agree",
  "health",
  "calls",
  "cost",
  "instance",
  "telemetry",
  "failure",
  "tokens?",
  "quiz",
  "prep",
  "admin",
  "true",
  "false",
  "uuid",
  "slug",
  "key",
  "adaptive",
  "decision",
  "engine",
  "latency",
  "student",
];
/** Yalnız büyük harfle yasak (Türkçede "on" sayıdır). */
const FORBIDDEN_CASED = ["ON", "OFF", "OK"];

const FORBIDDEN_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${FORBIDDEN.join("|")})(?![\\p{L}\\p{N}_])`, "iu");
const FORBIDDEN_CASED_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${FORBIDDEN_CASED.join("|")})(?![\\p{L}\\p{N}_])`, "u");
/** Ham veritabanı adı (`ai_usage_events`, `pilot_user_ids`): görünen metinde yazılmaz. Dosya adının parçası sayılmaz. */
const SNAKE_CASE_RE = /(?<![\p{L}\p{N}_./-])[a-z]+(?:_[a-z0-9]+)+(?![\p{L}\p{N}_./-])/u;

/** Ters tırnakla açıkça kod diye işaretlenmiş parça (komut, dosya yolu) taranmaz. */
function withoutCodeSpans(text: string): string {
  return text.replace(/`[^`]*`/g, " ");
}

function isForbidden(raw: string): boolean {
  const text = withoutCodeSpans(raw);
  return FORBIDDEN_RE.test(text) || FORBIDDEN_CASED_RE.test(text) || SNAKE_CASE_RE.test(text);
}

/** Kod taşıyan öznitelikler: taranmaz. */
const CODE_ATTRIBUTES = new Set([
  "className",
  "href",
  "key",
  "type",
  "name",
  "id",
  "value",
  "defaultValue",
  "role",
  "inputMode",
  "method",
  "htmlFor",
  "tone",
  "variant",
  "size",
  "src",
  "target",
  "rel",
  "action",
  "promptKey",
  "flagKey",
  "planId",
  "jobId",
  "requestId",
  "applicationId",
  "promptId",
]);

/** Nesne içinde ekrana giden değerlerin özellik adları. */
const VISIBLE_PROPERTIES = new Set(["title", "label", "desc", "hint", "message", "error", "name", "definition", "blurb", "decision", "jev"]);

const VISIBLE_CALL = /^(toast\.\w+|set[A-Z]\w*)$/;

type Hit = { file: string; text: string };

function visibleTexts(file: string): string[] {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];

  /** Dize, yukarı doğru yalnız "değer taşıyan" düğümlerden geçip görünen bir yere varıyor mu? */
  const reachesVisible = (node: ts.Node): boolean => {
    let current: ts.Node = node;
    for (;;) {
      const parent = current.parent;
      if (!parent) return false;
      if (ts.isJsxExpression(parent)) {
        const holder = parent.parent;
        if (holder && ts.isJsxAttribute(holder)) return !CODE_ATTRIBUTES.has(holder.name.getText(sf));
        return true;
      }
      if (ts.isJsxAttribute(parent)) return !CODE_ATTRIBUTES.has(parent.name.getText(sf));
      if (ts.isPropertyAssignment(parent)) {
        return parent.initializer === current && VISIBLE_PROPERTIES.has(parent.name.getText(sf));
      }
      if (ts.isCallExpression(parent)) {
        return parent.arguments.includes(current as ts.Expression) && VISIBLE_CALL.test(parent.expression.getText(sf));
      }
      if (ts.isConditionalExpression(parent)) {
        if (parent.condition === current) return false;
      } else if (ts.isBinaryExpression(parent)) {
        const op = parent.operatorToken.kind;
        const passes =
          op === ts.SyntaxKind.PlusToken ||
          op === ts.SyntaxKind.QuestionQuestionToken ||
          op === ts.SyntaxKind.BarBarToken ||
          (op === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === current);
        if (!passes) return false;
      } else if (
        !ts.isParenthesizedExpression(parent) &&
        !ts.isArrayLiteralExpression(parent) &&
        !ts.isTemplateSpan(parent) &&
        !ts.isTemplateExpression(parent) &&
        !ts.isAsExpression(parent)
      ) {
        return false;
      }
      current = parent;
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText(sf).replace(/\s+/g, " ").trim();
      if (text) out.push(text);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (reachesVisible(node)) out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      if (reachesVisible(node)) {
        out.push(node.head.text);
        for (const span of node.templateSpans) out.push(span.literal.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.filter((text) => text.trim());
}

function forbiddenHits(files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    for (const text of visibleTexts(file)) {
      if (isForbidden(text)) hits.push({ file, text });
    }
  }
  return hits;
}

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
}

/** Bu PR'ın düzelttiği dosyalar: kesin bekçi. */
const OWN_PAGES: { file: string; href: string; guard: "admin" | "founder" }[] = [
  { file: "src/app/admin/page.tsx", href: "/admin", guard: "admin" },
  { file: "src/app/admin/adaptive/page.tsx", href: "/admin/adaptive", guard: "admin" },
  { file: "src/app/admin/anket/page.tsx", href: "/admin/anket", guard: "admin" },
  { file: "src/app/admin/beta/page.tsx", href: "/admin/beta", guard: "admin" },
  { file: "src/app/admin/ders-hatalari/page.tsx", href: "/admin/ders-hatalari", guard: "admin" },
  { file: "src/app/admin/destek/page.tsx", href: "/admin/destek", guard: "admin" },
  { file: "src/app/admin/kredi-kurallari/page.tsx", href: "/admin/kredi-kurallari", guard: "founder" },
  { file: "src/app/admin/ogretmen-basvurulari/page.tsx", href: "/admin/ogretmen-basvurulari", guard: "admin" },
  { file: "src/app/admin/paketler/page.tsx", href: "/admin/paketler", guard: "founder" },
  { file: "src/app/admin/promptlar/page.tsx", href: "/admin/promptlar", guard: "admin" },
  { file: "src/app/admin/yanit-oylari/page.tsx", href: "/admin/yanit-oylari", guard: "admin" },
];

const OWN_FILES = [
  ...OWN_PAGES.map((page) => page.file),
  "src/app/admin/adaptive/jev-admin-controls.tsx",
  "src/components/admin/admin-rows.tsx",
  "src/components/admin/admin-shell.tsx",
  "src/components/admin/admin-ui.tsx",
  "src/components/admin/application-review.tsx",
  "src/components/admin/cockpit-quarantine.tsx",
  "src/components/admin/cockpit-superseded.tsx",
  "src/components/admin/free-preview-toggle.tsx",
  "src/components/admin/fx-rate-form.tsx",
  "src/components/admin/plan-editor.tsx",
  "src/components/admin/prompt-editor.tsx",
  "src/components/admin/spend-cap-form.tsx",
  "src/components/admin/stuck-reset-button.tsx",
  "src/components/admin/support-answered-button.tsx",
];

/**
 * BAŞKA PR'LARDA DÜZELECEK DOSYALAR (6 Kasım 2026, yönetim panelinin Türkçe turu). Paralel geliştiriciler bu
 * sayfaları yazıyor; burada dokunulmadı. O PR'lar birleşince bu liste BOŞALTILIR ve bütün ağaç kesin bekçiye girer.
 */
const PENDING_OTHER_PRS = new Set([
  // Kullanıcı yönetimi
  "src/app/admin/kullanicilar/page.tsx",
  "src/app/admin/kullanicilar/[userId]/page.tsx",
  "src/app/admin/kullanicilar/[userId]/hazirlik/[prepId]/page.tsx",
  "src/components/admin/user-actions.tsx",
  "src/components/admin/subscription-extend.tsx",
  // Gelir, maliyet, promosyon
  "src/app/admin/maliyetler/page.tsx",
  "src/app/admin/odemeler/page.tsx",
  "src/components/admin/refund-button.tsx",
  "src/app/admin/promosyonlar/page.tsx",
  "src/components/admin/campaign-form.tsx",
  "src/components/admin/promo-tools.tsx",
  "src/app/admin/ai-kullanimi/page.tsx",
  // Sistem ve güvenlik
  "src/app/admin/sistem/page.tsx",
  "src/components/admin/digest-send-button.tsx",
  "src/components/admin/smtp-test-button.tsx",
  "src/app/admin/feature-flags/page.tsx",
  "src/app/admin/audit-log/page.tsx",
  "src/app/admin/kotuye-kullanim/page.tsx",
  // Ortak düzen ve menü (temel PR'ın sahibi)
  "src/app/admin/layout.tsx",
  "src/components/admin/admin-nav-links.tsx",
]);

describe("yönetim paneli Türkçe — bu PR'ın sayfaları (kesin)", () => {
  it("görünen metinde yasak İngilizce terim yok", () => {
    expect(forbiddenHits(OWN_FILES)).toEqual([]);
  });

  it("tarayıcı gerçekten görünen metni okuyor (kendi kendini sınar)", () => {
    // Bu dosyalarda bilinen görünen metinler okunmalı; okunmuyorsa bekçi kördür.
    expect(visibleTexts("src/app/admin/destek/page.tsx").join(" ")).toContain("Cevaplandı");
    expect(visibleTexts("src/app/admin/beta/page.tsx")).toContain("Son 7 gün");
    expect(visibleTexts("src/components/admin/application-review.tsx").join(" ")).toContain("Başvuru güncellendi.");
    // Karşılaştırma ve fonksiyon argümanı görünen metin değildir.
    expect(visibleTexts("src/components/admin/application-review.tsx")).not.toContain("approved");
    expect(visibleTexts("src/app/admin/ogretmen-basvurulari/page.tsx")).not.toContain("pending");
  });

  for (const page of OWN_PAGES) {
    it(`${page.href}: sayfa koruması ve menüyle aynı başlık`, () => {
      const source = readFileSync(path.join(ROOT, page.file), "utf8");
      const guard = page.guard === "founder" ? "await requireFounderPage()" : "await requireAdminPage()";
      expect(source).toContain(guard);
      const item = adminNavItem(page.href);
      expect(item, page.href).not.toBeNull();
      expect(source).toContain(`export const metadata = { title: "Yönetim · ${item!.label}" };`);
    });
  }

  it("bu PR'ın her dosyası gerçekten var", () => {
    for (const file of OWN_FILES) expect(statSync(path.join(ROOT, file)).isFile(), file).toBe(true);
  });
});

describe("yönetim paneli Türkçe — bütün /admin ağacı", () => {
  const all = [...walk("src/app/admin"), ...walk("src/components/admin")];

  it("hariç liste dışındaki her dosyada yasak terim yok", () => {
    expect(forbiddenHits(all.filter((file) => !PENDING_OTHER_PRS.has(file)))).toEqual([]);
  });

  it("hariç listedeki her dosya hâlâ var (silinen ya da taşınan dosya listeden çıkarılır)", () => {
    for (const file of PENDING_OTHER_PRS) expect(all, file).toContain(file);
  });

});

describe("bekçinin kendisi", () => {
  it("yasak terimi, büyük harfli kısaltmayı ve ham veritabanı adını yakalar; kodu ve Türkçeyi geçirir", () => {
    expect(isForbidden("Kayıt pending")).toBe(true);
    expect(isForbidden("Circuit (instance)")).toBe(true);
    expect(isForbidden("ON")).toBe(true);
    expect(isForbidden("OpenAI gideri ai_usage_events'ten")).toBe(true);
    expect(isForbidden("Son on gün")).toBe(false);
    expect(isForbidden("Bekliyor · Doğrulandı · Karantinada")).toBe(false);
    expect(isForbidden("Değeri `node scripts/admin-pin-hash.mjs` ile üret")).toBe(false);
    expect(isForbidden("dosya: 20260904140000_message_feedback.sql")).toBe(false);
    expect(isForbidden("ADMIN_GATE_PIN_HASH okunamadı")).toBe(false);
  });
});

describe("ham durum kodlarının Türkçe eşlemesi (status-labels)", () => {
  it("bilinen kodlar Türkçe", () => {
    expect(statusLabel("verified")).toBe("Doğrulandı");
    expect(statusLabel("stale")).toBe("Karantinada");
    expect(statusLabel("rejected")).toBe("Reddedildi");
    expect(statusLabel("pending")).toBe("Bekliyor");
    expect(statusLabel("active")).toBe("Etkin");
    expect(difficultyLabel("medium")).toBe("Orta");
    expect(generationKindLabel("lesson")).toBe("Ders");
    expect(decisionProviderLabel("openai_fallback")).toBe("OpenAI yedeği");
    expect(learningActionLabel("worked_example")).toBe("Çözümlü örnek");
    expect(topicStatusLabel("mastered")).toBe("Öğrenildi");
    expect(topicStatusLabel("completed")).toBe("Tamamlandı");
    expect(promptKeyLabel("student_chat")).toBe("Sohbetteki öğretmen");
  });

  it("boş kod tire, bilinmeyen kod olduğu gibi (sessizce kaybolmaz)", () => {
    expect(statusLabel(null)).toBe("—");
    expect(statusLabel("  ")).toBe("—");
    expect(statusLabel("yeni_durum")).toBe("yeni_durum");
    expect(shortId("9d79106a-1111-2222-3333-444444444444")).toBe("9d79106a");
  });
});
