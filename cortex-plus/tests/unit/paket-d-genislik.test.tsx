// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decodeEntities,
  fetchImportedDocument,
  htmlToText,
  isPrivateAddress,
  safeImportUrl,
  URL_IMPORT_MAX_BYTES,
  URL_IMPORT_MESSAGES,
} from "@/lib/documents/url-import";
import { CURRICULUM_LEVELS, curriculumPick } from "@/lib/learning/exam-catalog";
import { pastedTextFile, PASTE_MIN_CHARS } from "@/components/parity/paste-text-panel";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";

const read = (path: string) => readFileSync(path, "utf8");
const publicResolver = async () => ["93.184.216.34"];

/* ───────────── URL güvenliği ───────────── */

describe("Paket D · bağlantı yalnız herkese açık adrese gider", () => {
  it("özel, yerel ve ayrılmış adresler tanınır", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "bozuk"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "172.32.0.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("http(s) dışı, kimlik bilgili, özel ağa çözülen ve bulut üst veri adresleri reddedilir", async () => {
    expect(await safeImportUrl("ftp://ornek.com/a.pdf", publicResolver)).toEqual({ ok: false, error: "url_invalid" });
    expect(await safeImportUrl("https://kullanici:sifre@ornek.com/", publicResolver)).toEqual({ ok: false, error: "url_invalid" });
    expect(await safeImportUrl("http://localhost:3000/admin", publicResolver)).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("http://169.254.169.254/latest/meta-data", publicResolver)).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("http://metadata.google.internal/", publicResolver)).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("https://ornek.com:8443/", publicResolver)).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("https://ic.ornek.com/", async () => ["10.0.0.5"])).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("https://ikili.ornek.com/", async () => ["93.184.216.34", "192.168.0.2"])).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("https://yok.ornek.com/", async () => { throw new Error("ENOTFOUND"); })).toEqual({ ok: false, error: "url_unreachable" });
    const ok = await safeImportUrl("https://ornek.com/ders/konu-1", publicResolver);
    expect(ok.ok && ok.url.href).toBe("https://ornek.com/ders/konu-1");
  });

  it("yönlendirme izlenir ama özel adrese yönlendirme reddedilir; 3'ten fazla yönlendirme kesilir", async () => {
    const hops: string[] = [];
    const fetchRedirect = async (url: string) => {
      hops.push(url);
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/gizli" } });
    };
    expect(await fetchImportedDocument("https://ornek.com/kisa", { fetch: fetchRedirect, resolve: publicResolver })).toEqual({ ok: false, error: "url_private" });
    expect(hops).toEqual(["https://ornek.com/kisa"]);
    const loop = async (url: string) => new Response(null, { status: 301, headers: { location: `${url}/x` } });
    expect(await fetchImportedDocument("https://ornek.com/a", { fetch: loop, resolve: publicResolver })).toEqual({ ok: false, error: "url_unreachable" });
  });
});

/* ───────────── HTML → belge ───────────── */

describe("Paket D · sayfa metni belge olur", () => {
  const page = `<!doctype html><html><head><title>Hücre Zarı &amp; Taşıma — Ders 3</title><style>p{}</style></head>
  <body><nav><a>Ana sayfa</a><a>Dersler</a></nav>
  <main><h1>Hücre zarı</h1><p>Hücre zarı &quot;seçici geçirgen&quot; bir yapıdır; su serbest, iyonlar kanalla geçer.</p>
  <script>track()</script><ul><li>Osmoz: suyun geçişi</li><li>Difüzyon: çözünenin geçişi</li></ul>
  <p>Aktif taşıma ATP harcar &#8211; düşükten yükseğe.</p></main>
  <footer>© Ornek</footer></body></html>`;

  it("menü, script ve altbilgi düşer; başlık, liste ve varlıklar okunur", () => {
    const { title, text } = htmlToText(page);
    expect(title).toBe("Hücre Zarı & Taşıma — Ders 3");
    expect(text).toContain('Hücre zarı "seçici geçirgen" bir yapıdır');
    expect(text).toContain("• Osmoz: suyun geçişi");
    expect(text).toContain("ATP harcar – düşükten yükseğe");
    expect(text).not.toContain("Ana sayfa");
    expect(text).not.toContain("track()");
    expect(text).not.toContain("© Ornek");
    expect(decodeEntities("&lt;b&gt; &#x27;a&#x27; &nbsp;x")).toBe("<b> 'a'  x");
  });

  it("HTML sayfa .txt belge, PDF olduğu gibi, kısa sayfa ve büyük dosya reddedilir", async () => {
    const long = page.replace("</main>", `<p>${"Bu cümle metni uzatır. ".repeat(20)}</p></main>`);
    const html = await fetchImportedDocument("https://ornek.com/ders", {
      resolve: publicResolver,
      fetch: async () => new Response(long, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    expect(html.ok).toBe(true);
    if (html.ok) {
      expect(html.document.kind).toBe("text");
      expect(html.document.file.name).toBe("Hücre Zarı & Taşıma — Ders 3.txt");
      expect(html.document.file.type).toBe("text/plain");
      const body = await html.document.file.text();
      expect(body.startsWith("Hücre Zarı & Taşıma — Ders 3\nKaynak: https://ornek.com/ders")).toBe(true);
    }
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...new Array(64).fill(0x20)]);
    const pdf = await fetchImportedDocument("https://ornek.com/notlar/fizyoloji.pdf", {
      resolve: publicResolver,
      fetch: async () => new Response(pdfBytes, { status: 200, headers: { "content-type": "application/octet-stream" } }),
    });
    expect(pdf.ok && pdf.document.kind).toBe("pdf");
    expect(pdf.ok && pdf.document.file.name).toBe("fizyoloji.pdf");
    const thin = await fetchImportedDocument("https://ornek.com/bos", {
      resolve: publicResolver,
      fetch: async () => new Response("<html><body><p>Giriş yap</p></body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    expect(thin).toEqual({ ok: false, error: "url_no_text" });
    const big = await fetchImportedDocument("https://ornek.com/buyuk.pdf", {
      resolve: publicResolver,
      fetch: async () =>
        new Response("x", { status: 200, headers: { "content-type": "application/pdf", "content-length": String(URL_IMPORT_MAX_BYTES + 1) } }),
    });
    expect(big).toEqual({ ok: false, error: "url_too_large" });
    const blocked = await fetchImportedDocument("https://ornek.com/kapali", {
      resolve: publicResolver,
      fetch: async () => new Response("", { status: 403 }),
    });
    expect(blocked).toEqual({ ok: false, error: "url_blocked" });
    expect(URL_IMPORT_MESSAGES.url_blocked).toContain("Metin yapıştır");
  });

  it("uç yüklemeyle aynı kayda yazar; sihirbaz paneli hatayı sunucudan gösterir", () => {
    const route = read("src/app/api/documents/from-url/route.ts");
    expect(route).toContain("storeUserDocument(service, userId, file)");
    expect(route).toContain("fitsInQuota(usage, file.size)");
    expect(route).toMatch(/scope: "doc-from-url", limit: 4, dailyLimit: 30/);
    const panel = read("src/components/parity/url-import-panel.tsx");
    expect(panel).toContain('fetch("/api/documents/from-url"');
    expect(panel).toContain("setError(payload.error ??");
  });
});

/* ───────────── Metin yapıştır ───────────── */

describe("Paket D · yapıştırılan metin .txt belge olur", () => {
  it("kısa metin reddedilir; ad temizlenir; dosya text/plain", async () => {
    expect(pastedTextFile("kısa", "x")).toBeNull();
    const body = "Osmoz suyun yarı geçirgen zardan geçişidir. ".repeat(4);
    const file = pastedTextFile(body, 'Biyoloji / Hücre: "Taşıma"?');
    expect(file).not.toBeNull();
    expect(file!.name).toBe("Biyoloji Hücre Taşıma.txt");
    expect(file!.type).toBe("text/plain");
    expect(await file!.text()).toBe(body.trim());
    expect(pastedTextFile(body, "")!.name).toBe("Yapıştırılan not.txt");
    expect(PASTE_MIN_CHARS).toBe(80);
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("onFile={(file) => void takeFiles([file])}");
    expect(read("src/lib/documents/upload-accept.ts")).toContain('".txt": "text/plain"');
  });
});

/* ───────────── Hazır müfredat ───────────── */

describe("Paket D · hazır müfredattan başlangıç", () => {
  it("düzeyler: 5–12. sınıf, LGS, TYT, AYT, KPSS, ALES, DGS, YDS, TUS, DUS, Üniversite", () => {
    expect(CURRICULUM_LEVELS.map((level) => level.id)).toEqual([
      "sinif-5", "sinif-6", "sinif-7", "sinif-8", "sinif-9", "sinif-10", "sinif-11", "sinif-12",
      "lgs", "tyt", "ayt", "kpss", "ales", "dgs", "yds", "tus", "dus", "universite",
    ]);
    for (const level of CURRICULUM_LEVELS) expect(level.freeSubject || level.subjects.length > 0, level.id).toBe(true);
  });

  it("seçim kurulumun dersini ve ilk mesajını verir; konu listesi kodda yok", () => {
    expect(curriculumPick("sinif-9", "Fizik")).toEqual({ subject: "Fizik", prompt: "9. sınıf Fizik müfredatındaki konulara çalışmak istiyorum." });
    expect(curriculumPick("tyt", "Temel Matematik")).toEqual({ subject: "TYT Temel Matematik", prompt: "TYT Temel Matematik müfredatındaki konulara çalışmak istiyorum." });
    expect(curriculumPick("universite", "Mikroekonomi")).toEqual({ subject: "Mikroekonomi", prompt: "Mikroekonomi dersinin üniversite müfredatındaki konulara çalışmak istiyorum." });
    expect(curriculumPick("universite", "  ")).toBeNull();
    expect(curriculumPick("yok", "Fizik")).toBeNull();
    const catalog = read("src/lib/learning/exam-catalog.ts");
    expect(catalog).not.toMatch(/Ünite 1|Üniteler|topics:/);
  });

  it("seçim sohbeti dolu istemle açar ve istem kendiliğinden gönderilir", () => {
    expect(WIZARD_COPY.pickCurriculum).toBe("📚 Dosyam yok — hazır müfredattan seç");
    const entry = read("src/components/parity/exam-create-entry.tsx");
    expect(entry).toContain("initialPrompt={picked?.prompt ?? initialPrompt}");
    expect(entry).toContain("autoStart={Boolean(picked?.prompt)}");
    const chat = read("src/components/parity/exam-create-chat.tsx");
    expect(chat).toMatch(/if \(!autoStart \|\| !initialPrompt \|\| autoStarted\.current\) return;[\s\S]*void send\(\);/);
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("onPick={(pick) => onUseChat({ subject: pick.subject, examDate, target, prompt: pick.prompt })}");
  });
});
