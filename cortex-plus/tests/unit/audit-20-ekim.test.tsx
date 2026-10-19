// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
  20 Ekim 2026 denetimi: canlı kayıtlardan ve sayfa taramasından çıkan küçük hatalar. Her blok bir
  bulgu; açıklama neyin bozuk olduğunu, test neyin bir daha bozulmayacağını söyler.
*/

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { SohbetlerList, groupLabel } = await import("@/components/parity/sohbetler-list");
const { servedOpenPath, READY_WAIT_MS } = await import("@/lib/admin/beta-metrics");
const { CHAT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_ACCEPT, MIME_BY_EXTENSION } = await import("@/lib/documents/upload-accept");
const { DOCUMENT_ALLOWED_TYPES } = await import("@/lib/documents/store-upload");
const { cspDirectives } = await import("@/lib/security/csp");

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(cleanup);

/*
  Sohbetler sayfası canlıda React #418 veriyordu: "Bugün / Dün" sunucuda UTC gününe, tarayıcıda
  Türkiye gününe göre hesaplanıyordu. Gün artık Türkiye takvimiyle ve sunucunun verdiği tek
  "şimdi"yle hesaplanıyor; sunucu ve tarayıcı aynı başlığı yazar.
*/
describe("Sohbetler: Bugün / Dün Türkiye gününe göre", () => {
  // 20 Ekim 02:30 (TRT) = 19 Ekim 23:30 UTC.
  const now = "2026-10-19T23:30:00.000Z";

  it("UTC'de dün olan gece 01:00 Türkiye'de bugün", () => {
    expect(groupLabel("2026-10-19T22:00:00.000Z", now)).toBe("BUGÜN");
    expect(groupLabel("2026-10-19T20:00:00.000Z", now)).toBe("DÜN");
    expect(groupLabel("2026-10-18T20:00:00.000Z", now)).toBe("DAHA ESKİ");
  });

  it("başlıklar sayfanın verdiği 'şimdi'den çıkar, tarayıcının saatinden değil", () => {
    render(
      <SohbetlerList
        now={now}
        items={[
          { id: "a", title: "Gece sorusu", updatedAt: "2026-10-19T22:00:00.000Z" },
          { id: "b", title: "Akşam sorusu", updatedAt: "2026-10-19T20:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByText("BUGÜN")).toBeTruthy();
    expect(screen.getByText("DÜN")).toBeTruthy();
    const list = read("src/components/parity/sohbetler-list.tsx");
    expect(list).not.toMatch(/\.setHours\(/);
    expect(read("src/app/sohbetler/page.tsx")).toContain("now={new Date().toISOString()}");
  });
});

/*
  /admin/beta "hazır ders p95 < 3 sn" ölçütü tek bir açılış yüzünden düşüyordu: sunucu süren önceden
  yazımın bitmesini 10,7 sn bekleyip dersi verdi, kayıt "hazır" dedi. Beklenen açılış "devralınan".
*/
describe("açılış kaydı: beklenen hazır içerik devralınan sayılır", () => {
  it("bir bekleme turundan kısası hazır, uzunu devralınan", () => {
    expect(servedOpenPath(null)).toBe("ready");
    expect(servedOpenPath(0)).toBe("ready");
    expect(servedOpenPath(READY_WAIT_MS - 1)).toBe("ready");
    expect(servedOpenPath(READY_WAIT_MS)).toBe("adopted");
    expect(servedOpenPath(9_500)).toBe("adopted");
  });

  it("rota hazır kaydında beklemeyi hesaba katar (ders ve akışsız içerik)", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("servedOpenPath(Math.max(peekBuildingMs ?? 0, prefetchWaitMs))");
    expect(route).not.toMatch(/path: "ready", ms/);
  });
});

/*
  Sunucu PDF, Word, PowerPoint, TXT ve fotoğrafın hepsini okuyor; ama Araçlar fotoğraf, sohbet Word ve
  PowerPoint seçtirmiyordu. Sohbet API'si Word/PowerPoint için "desteklenmiyor" diyordu.
*/
describe("yükleme türleri tek kaynaktan", () => {
  it("belge seçicisi sunucunun kabul ettiği her türü içerir", () => {
    for (const extension of Object.keys(MIME_BY_EXTENSION)) {
      expect(DOCUMENT_UPLOAD_ACCEPT.split(",")).toContain(extension);
    }
    for (const mime of DOCUMENT_ALLOWED_TYPES) {
      expect(Object.values(MIME_BY_EXTENSION), mime).toContain(mime);
    }
  });

  it("sohbet Word, PowerPoint ve TXT alır; görüntü modelinin okumadığı HEIC'i almaz", () => {
    const chat = CHAT_UPLOAD_ACCEPT.split(",");
    for (const extension of [".pdf", ".txt", ".docx", ".pptx", ".jpg", ".png", ".webp"]) {
      expect(chat).toContain(extension);
    }
    expect(chat).not.toContain(".heic");
  });

  it.each([
    ["src/components/learning/studio/studio-setup.tsx", "DOCUMENT_UPLOAD_ACCEPT"],
    ["src/components/parity/exam-create-wizard.tsx", "DOCUMENT_UPLOAD_ACCEPT"],
    ["src/components/parity/prep-add-material.tsx", "DOCUMENT_UPLOAD_ACCEPT"],
    ["src/components/parity/upload-modal.tsx", "CHAT_UPLOAD_ACCEPT"],
    ["src/components/chat/chat-panel.tsx", "CHAT_UPLOAD_ACCEPT"],
  ])("%s seçicisi ortak listeyi kullanır", (file, constant) => {
    const source = read(file);
    expect(source).toContain(`accept={${constant}}`);
    // Elle yazılmış belge listesi kalmadı (kamera ve yalnız-fotoğraf seçicileri hariç).
    expect(source).not.toMatch(/accept="\.pdf/);
  });

  it("sohbet Word ve PowerPoint'i belgeli sohbete alır, işlenmemişse modelsiz okur", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain('doc.mime_type === "text/plain" || isOfficeDocument(doc.mime_type)');
    expect(route).toContain("extractOfficeText(buffer, doc.mime_type)");
  });
});

/*
  Her sayfa açılışında tarayıcı 2-4 güvenlik ihlali raporu gönderiyordu: PostHog ayar dosyasını
  eu-assets'ten çekiyor, adres listede yoktu; anket betiği de (kullanılmıyor) her sayfada yükleniyordu.
*/
describe("güvenlik politikası ve analitik", () => {
  it("PostHog'un dosya adresi betik ve bağlantı listesinde", () => {
    const directives = cspDirectives();
    expect(directives["script-src"]).toContain("https://eu-assets.i.posthog.com");
    expect(directives["connect-src"]).toContain("https://eu-assets.i.posthog.com");
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("PostHog anket betiği kapalı", () => {
    expect(read("src/components/analytics.tsx")).toContain("disable_surveys: true");
  });
});

describe("küçükler", () => {
  it("fotoğraf okuma kimyasal formülü LaTeX'e çevirmez", () => {
    const source = read("src/lib/documents/extract-image-text.ts");
    expect(source).toContain("kimyasal formülleri ve birimleri (CO₂, H₂O, Na⁺, mmHg) LaTeX'e çevirmeden");
  });

  it("/okulum hazırlıkların altındaki okul sayfasına gider", () => {
    expect(read("next.config.ts")).toContain(
      '{ source: "/okulum", destination: "/deneme-sinavlari/okulum", permanent: true }',
    );
  });
});
