import "server-only";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";

/**
 * Bağlantıdan materyal (29 Ekim 2026). Öğrenci elinde PDF olmadan bir ders sayfası ya da makale
 * bağlantısı verir; sayfa metni (ya da bağlantının PDF'i) belge olarak kaydedilir ve bildiğimiz yoldan
 * işlenir (konu haritası, ders, test). Bu dosya yalnız indirip metne çevirir; kredi, kota ve kayıt
 * yükleme ucundaki kurallarla aynıdır.
 *
 * Sunucu dışarıya istek attığı için adres sıkı denetlenir: yalnız http(s), özel/yerel ağ adresleri
 * (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 198.18/15, ::1, fc00::/7, fe80::/10; IPv6 içine gömülü
 * IPv4 de çözülüp denetlenir) ve bulut üst veri adresi
 * yasak; yönlendirme en çok 3 ve her adımda aynı denetim; gövde 15 MB, süre 20 sn.
 */

export const URL_IMPORT_MAX_BYTES = 15 * 1024 * 1024;
export const URL_IMPORT_TIMEOUT_MS = 20_000;
export const URL_IMPORT_MAX_REDIRECTS = 3;
/** Metinden belge olması için en az bu kadar karakter; daha azı sayfa kabuğudur (çerez bandı, menü). */
export const URL_IMPORT_MIN_TEXT = 200;
const MAX_TEXT_CHARS = 300_000;

export type UrlImportError =
  | "url_invalid"
  | "url_private"
  | "url_unreachable"
  | "url_too_large"
  | "url_unsupported"
  | "url_no_text"
  | "url_blocked";

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true });
  return records.map((record) => record.address);
};

function ipv4Private(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // taşıyıcı NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 ölçüm ağı
  if (a >= 224) return true; // çoklu yayın / ayrılmış
  return false;
}

/**
 * IPv6 adresini sekiz 16 bitlik gruba açar ("::" kısaltması ve sondaki noktalı IPv4 dahil).
 * Çözülemeyen biçim null (çağıran güvenli saymaz).
 */
export function expandIpv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // Sondaki noktalı IPv4 iki gruba çevrilir (::ffff:1.2.3.4 → ::ffff:102:304).
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = dotted[2]!.split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const [p0, p1, p2, p3] = parts as [number, number, number, number];
    text = `${dotted[1]}${((p0 << 8) | p1).toString(16)}:${((p2 << 8) | p3).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":") : []);
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    out.push(Number.parseInt(group, 16));
  }
  return out;
}

function ipv4FromGroups(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * IPv6 içine gömülü IPv4 (6 Kasım 2026). `new URL()` "[::ffff:169.254.169.254]" adresini
 * "[::ffff:a9fe:a9fe]" diye onaltılık yazıyor; eski denetim yalnız noktalı biçimi tanıdığı için bulut
 * üst veri adresi geçiyordu. Eşlenmiş (::ffff:0:0/96), SIIT (::ffff:0:0:0/96), uyumlu (::/96),
 * NAT64 (64:ff9b::/96) ve 6to4 (2002::/16) biçimleri IPv4'e çevrilip aynı listeyle denetlenir.
 */
export function embeddedIpv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const zeroHead = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  if (zeroHead && g4 === 0 && g5 === 0xffff) return ipv4FromGroups(g6, g7); // ::ffff:a.b.c.d
  if (zeroHead && g4 === 0xffff && g5 === 0) return ipv4FromGroups(g6, g7); // ::ffff:0:a.b.c.d
  if (zeroHead && g4 === 0 && g5 === 0) return ipv4FromGroups(g6, g7); // ::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return ipv4FromGroups(g6, g7);
  if (g0 === 0x2002) return ipv4FromGroups(g1, g2);
  return null;
}

function ipv6Private(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return true;
  if (groups.every((group) => group === 0)) return true; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1
  const g0 = groups[0]!;
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 (eski site-yerel)
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 çoklu yayın
  if (g0 === 0x64 && groups[1] === 0xff9b && groups[2] === 1) return true; // 64:ff9b:1::/48 yerel NAT64
  if (g0 === 0x2001 && groups[1] === 0) return true; // 2001::/32 Teredo (gömülü adres ters çevrili)
  const v4 = embeddedIpv4(groups);
  if (v4) return ipv4Private(v4);
  return false;
}

/** Özel, yerel ya da ayrılmış bir adres mi. Bilinmeyen biçim güvenli sayılmaz. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind === 6) return ipv6Private(ip);
  return true;
}

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "instance-data"]);

/**
 * Adres denetimi. Dönen `url` normalleştirilmiş hâlidir; `addresses` çözülen IP'ler (yönlendirme
 * denetimi için). Test çözücüyü enjekte eder.
 */
export async function safeImportUrl(
  raw: string,
  resolve: Resolver = defaultResolver,
): Promise<{ ok: true; url: URL } | { ok: false; error: UrlImportError }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "url_invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "url_invalid" };
  if (url.username || url.password) return { ok: false, error: "url_invalid" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, error: "url_private" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, error: "url_private" };
  }
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(literal)) return isPrivateAddress(literal) ? { ok: false, error: "url_private" } : { ok: true, url };
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return { ok: false, error: "url_unreachable" };
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) return { ok: false, error: "url_private" };
  return { ok: true, url };
}

/* ───────────── HTML → metin ───────────── */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
}

const DROP_BLOCKS = /<(script|style|noscript|svg|canvas|iframe|template|nav|footer|header|aside|form|button)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_END = /<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|table|ul|ol|dd|dt|figcaption)\s*>|<br\s*\/?>|<hr\s*\/?>/gi;

/**
 * Sayfanın okunur metni. `<article>` ya da `<main>` varsa yalnız o (menü ve altbilgi dışarıda kalır);
 * yoksa gövde. Başlık `<title>`dan.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]!).replace(/\s+/g, " ").trim().slice(0, 120) : "";
  let scope = html;
  const article = html.match(/<article\b[\s\S]*?<\/article\s*>/i) ?? html.match(/<main\b[\s\S]*?<\/main\s*>/i);
  if (article && article[0].length > 500) scope = article[0];
  else {
    const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i);
    if (body) scope = body[1]!;
  }
  const text = decodeEntities(
    scope
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(DROP_BLOCKS, " ")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(BLOCK_END, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
  return { title, text };
}

/* ───────────── İndirme ───────────── */

export type ImportedDocument = { file: File; kind: "pdf" | "text" };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function fileNameFrom(url: URL, title: string, ext: "pdf" | "txt"): string {
  const base = title.trim() || decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z0-9]{2,5}$/i, "") || url.hostname;
  const clean = base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "baglanti";
  return `${clean}.${ext}`;
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > URL_IMPORT_MAX_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > URL_IMPORT_MAX_BYTES ? null : buffer;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > URL_IMPORT_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Bağlantıyı indirir ve belgeye çevirir: PDF olduğu gibi, HTML ve düz metin `.txt` olarak.
 * Yönlendirme elle izlenir; her hedef yeniden denetlenir.
 */
export async function fetchImportedDocument(
  raw: string,
  deps: { fetch?: FetchLike; resolve?: Resolver } = {},
): Promise<{ ok: true; document: ImportedDocument } | { ok: false; error: UrlImportError }> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  let checked = await safeImportUrl(raw, deps.resolve);
  if (!checked.ok) return checked;
  let current = checked.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_IMPORT_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= URL_IMPORT_MAX_REDIRECTS; hop += 1) {
      let response: Response;
      try {
        response = await doFetch(current.toString(), {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": "CortexPlusBot/1.0 (+https://cortexplus.app)",
            accept: "text/html,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5",
            "accept-language": "tr,en;q=0.8",
          },
        });
      } catch {
        return { ok: false, error: "url_unreachable" };
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop === URL_IMPORT_MAX_REDIRECTS) return { ok: false, error: "url_unreachable" };
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { ok: false, error: "url_invalid" };
        }
        checked = await safeImportUrl(next.toString(), deps.resolve);
        if (!checked.ok) return checked;
        current = checked.url;
        continue;
      }
      if (response.status === 401 || response.status === 403) return { ok: false, error: "url_blocked" };
      if (!response.ok) return { ok: false, error: "url_unreachable" };
      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      const body = await readCapped(response);
      if (!body) return { ok: false, error: "url_too_large" };
      const head = Buffer.from(body.subarray(0, 5)).toString("latin1");
      if (type.includes("application/pdf") || head === "%PDF-") {
        const file = new File([body as BlobPart], fileNameFrom(current, "", "pdf"), { type: "application/pdf" });
        return { ok: true, document: { file, kind: "pdf" } };
      }
      if (type.includes("text/html") || type.includes("application/xhtml") || /^\s*<(!doctype|html)/i.test(Buffer.from(body.subarray(0, 64)).toString("utf8"))) {
        const { title, text } = htmlToText(Buffer.from(body).toString("utf8"));
        if (text.length < URL_IMPORT_MIN_TEXT) return { ok: false, error: "url_no_text" };
        const header = title ? `${title}\nKaynak: ${current.toString()}\n\n` : `Kaynak: ${current.toString()}\n\n`;
        const file = new File([header + text], fileNameFrom(current, title, "txt"), { type: "text/plain" });
        return { ok: true, document: { file, kind: "text" } };
      }
      if (type.includes("text/plain") || type.includes("text/markdown")) {
        const text = Buffer.from(body).toString("utf8").trim();
        if (text.length < URL_IMPORT_MIN_TEXT) return { ok: false, error: "url_no_text" };
        const file = new File([`Kaynak: ${current.toString()}\n\n${text}`], fileNameFrom(current, "", "txt"), { type: "text/plain" });
        return { ok: true, document: { file, kind: "text" } };
      }
      return { ok: false, error: "url_unsupported" };
    }
    return { ok: false, error: "url_unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Öğrenciye okunur hata (kod öğrenciye görünmez). */
export const URL_IMPORT_MESSAGES: Record<UrlImportError, string> = {
  url_invalid: "Bağlantı geçerli görünmüyor; http:// ya da https:// ile başlayan tam adresi yapıştır.",
  url_private: "Bu adres açılamaz: yalnız herkese açık web sayfaları eklenebilir.",
  url_unreachable: "Sayfaya ulaşılamadı. Adresi tarayıcıda açıp yeniden dene.",
  url_too_large: "Dosya 15 MB'tan büyük; PDF'i indirip buradan yükleyebilirsin.",
  url_unsupported: "Bu bağlantı bir web sayfası, PDF ya da metin değil.",
  url_no_text: "Sayfada okunacak metin bulunamadı (giriş isteyen ya da yalnız görsel içeren sayfa olabilir). Metni kopyalayıp \"Metin yapıştır\" ile ekleyebilirsin.",
  url_blocked: "Site bu sayfayı otomatik okumaya kapatmış. Metni kopyalayıp \"Metin yapıştır\" ile ekleyebilirsin.",
};
