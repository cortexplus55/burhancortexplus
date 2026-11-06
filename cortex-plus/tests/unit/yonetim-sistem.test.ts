import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ENGLISH_TERMS } from "./helpers/admin-english-terms";

/*
  Yönetim paneli · Sistem Sağlığı ve İçerik Havuzu (6 Kasım 2026): sınav ailesi eşlemesi bütün programları kapsar,
  sağlık ölçümü → Türkçe rozet, elle bakım yalnız kurucuya ve denetim kaydıyla, kaynakta yazılan her işlem kaydının
  Türkçe adı var, dört sayfa Türkçe (İngilizce terim listesi yonetim-temeli.test.ts'ten), depo boyutu göçü PGlite'ta.
*/

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// ---- Sahte sunucu bağımlılıkları (yalnız elle bakım eylemi için) -------------------------------

const state = vi.hoisted(() => ({
  founder: { ok: true, userId: "11111111-1111-4111-8111-111111111111" } as { ok: true; userId: string } | { ok: false; error: string },
  uploads: 0 as number | Error,
  eviction: null as unknown,
  calls: [] as string[],
  audits: [] as Record<string, unknown>[],
  evictOptions: null as unknown,
}));

const SERVICE = { tag: "service" };

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/admin-actor", () => ({
  checkFounderActor: async () => {
    state.calls.push("founder_check");
    return state.founder;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => SERVICE }));
vi.mock("@/lib/documents/upload-cleanup", () => ({
  cleanupExpiredUploads: async (service: unknown) => {
    state.calls.push(service === SERVICE ? "uploads" : "uploads_wrong_client");
    if (state.uploads instanceof Error) throw state.uploads;
    return state.uploads;
  },
}));
vi.mock("@/lib/documents/vector-lifecycle", () => ({
  evictColdEmbeddings: async (service: unknown, options: unknown) => {
    state.calls.push(service === SERVICE ? "evict" : "evict_wrong_client");
    state.evictOptions = options;
    return state.eviction;
  },
}));
vi.mock("@/lib/audit", () => ({
  auditLog: async (_service: unknown, params: Record<string, unknown>) => {
    state.calls.push("audit");
    state.audits.push(params);
  },
}));

import { CONTENT_FAMILIES, groupProgramsByFamily, lessonCoverage, POOL_STATE_BADGE, poolRowState } from "@/lib/admin/content-families";
import {
  databaseHealth,
  HEALTH_BADGE,
  openAiHealth,
  parseStorageReport,
  redisHealth,
  storageHealth,
  storageLimitBytes,
  worstHealth,
} from "@/lib/admin/system-health";
import { MAINTENANCE_CONFIRM, maintenanceMessage } from "@/lib/admin/maintenance";
import { AUDIT_LABELS, auditLabel, ENTITY_LABELS, entityLabel, SERVICE_DISPLAY, shortEntityId, UNKNOWN_AUDIT_LABEL } from "@/lib/admin/labels";
import { ABUSE_EXPLANATIONS, ABUSE_LABELS, ABUSE_SCOPE_LABELS, abuseScopeLabel, UNKNOWN_SCOPE_LABEL } from "@/lib/admin/abuse-labels";
import { runSystemMaintenance } from "@/app/admin/sistem/actions";

// ---- 1. Sınav aileleri -------------------------------------------------------------------------

type RegistryProgram = { id: string; kind: string; units: unknown[] };
const REGISTRY = JSON.parse(read("src/lib/curriculum/registry.json")) as { programs: RegistryProgram[] };
const PROGRAMS = REGISTRY.programs.map((program) => ({ id: program.id, kind: program.kind, unitCount: program.units.length }));

describe("içerik havuzu: sınav aileleri", () => {
  it("dokuz aile, istenen sıra; her program tam bir aileye düşer", () => {
    expect(CONTENT_FAMILIES.map((family) => family.label)).toEqual([
      "YKS", "LGS", "MEB 5–12. sınıf", "KPSS", "TUS", "DUS", "ALES", "DGS", "YDS",
    ]);
    const kinds = CONTENT_FAMILIES.flatMap((family) => family.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
    const { families, unmapped } = groupProgramsByFamily(PROGRAMS);
    expect(unmapped, "aileye bağlanmamış program: content-families.ts'e ekleyin").toEqual([]);
    for (const family of families) expect(family.programIds.length, family.label).toBeGreaterThan(0);
    const all = families.flatMap((family) => family.programIds);
    expect(all.length).toBe(PROGRAMS.length);
    expect(new Set(all).size).toBe(PROGRAMS.length);
    expect(families.reduce((sum, family) => sum + family.units, 0)).toBe(PROGRAMS.reduce((sum, p) => sum + p.unitCount, 0));
  });

  it("kayıt defterindeki her program türünün bir ailesi var (yeni tür eklenirse burada düşer)", () => {
    const registryKinds = new Set(PROGRAMS.map((program) => program.kind));
    const mapped = new Set(CONTENT_FAMILIES.flatMap((family) => family.kinds));
    for (const kind of registryKinds) expect(mapped.has(kind), kind).toBe(true);
  });

  it("eşlenmeyen program ayrıca döner, toplama girmez", () => {
    const { families, unmapped } = groupProgramsByFamily([...PROGRAMS.slice(0, 2), { id: "yeni-tur-1", kind: "bilinmeyen", unitCount: 9 }]);
    expect(unmapped).toEqual(["yeni-tur-1"]);
    expect(families.reduce((sum, family) => sum + family.units, 0)).toBe(PROGRAMS[0]!.unitCount + PROGRAMS[1]!.unitCount);
  });

  it("satır durumu ve ders kapsamı", () => {
    expect(poolRowState({ units: 10, lessonUnits: 10, verifiedItems: 50 })).toBe("full");
    expect(poolRowState({ units: 10, lessonUnits: 12, verifiedItems: 1 })).toBe("full");
    expect(poolRowState({ units: 10, lessonUnits: 7, verifiedItems: 50 })).toBe("partial");
    expect(poolRowState({ units: 10, lessonUnits: 10, verifiedItems: 0 })).toBe("partial");
    expect(poolRowState({ units: 10, lessonUnits: 0, verifiedItems: 0 })).toBe("empty");
    expect(poolRowState({ units: 10, lessonUnits: null, verifiedItems: 5 })).toBe("unknown");
    expect(Object.values(POOL_STATE_BADGE).map((badge) => badge.label)).toEqual(["Tam", "Eksik var", "Boş", "Ölçülemedi"]);
    expect(lessonCoverage({ units: 8, lessonUnits: 6 })).toBe(75);
    expect(lessonCoverage({ units: 8, lessonUnits: 9 })).toBe(100);
    expect(lessonCoverage({ units: 8, lessonUnits: null })).toBeNull();
  });
});

// ---- 2. Havuz sayımları: yalnız sayım sorgusu, aile başına dört ---------------------------------

describe("içerik havuzu: yükleyici", () => {
  it("36 sayım sorgusu (head + exact), satır okunmaz; düşen sayım 'ölçülemedi'", async () => {
    const { loadContentPoolReport } = await import("@/lib/admin/content-pool-report");
    const queries: { table: string; options: unknown; filters: string[] }[] = [];
    const service = {
      from(table: string) {
        const query = { table, options: null as unknown, filters: [] as string[] };
        queries.push(query);
        const builder: Record<string, unknown> = {
          select(_cols: string, options: unknown) {
            query.options = options;
            return builder;
          },
          then(resolve: (value: unknown) => void) {
            const ids = query.filters.find((f) => f.startsWith("in:"));
            const failing = ids?.includes("yds-") && query.filters.includes("eq:status=verified") && table === "item_bank";
            if (failing) return resolve({ count: null, error: { message: "boom" } });
            if (table === "topic_content") return resolve({ count: 5, error: null });
            if (query.filters.some((f) => f.startsWith("not:"))) return resolve({ count: 2, error: null });
            if (query.filters.includes("eq:status=stale")) return resolve({ count: 3, error: null });
            return resolve({ count: 40, error: null });
          },
        };
        for (const method of ["in", "eq", "is", "not"]) {
          builder[method] = (column: string, op: unknown, value?: unknown) => {
            query.filters.push(
              method === "in"
                ? `in:${(op as string[]).join(",")}`
                : method === "not"
                  ? `not:${column} ${String(op)} ${String(value)}`
                  : `${method}:${column}=${String(op)}`,
            );
            return builder;
          };
        }
        return builder;
      },
    };
    const report = await loadContentPoolReport(service as never);
    expect(queries).toHaveLength(CONTENT_FAMILIES.length * 4);
    for (const query of queries) expect(query.options).toEqual({ count: "exact", head: true });
    expect(report.unmapped).toEqual([]);
    const yks = report.rows.find((row) => row.id === "yks")!;
    expect(yks).toMatchObject({ lessonUnits: 5, verifiedItems: 40, quarantinedItems: 2, staleItems: 1 });
    const lessonQuery = queries.find((query) => query.table === "topic_content")!;
    expect(lessonQuery.filters).toEqual(expect.arrayContaining(["eq:kind=lesson", "eq:status=verified", "is:outcome_id=null"]));
    const yds = report.rows.find((row) => row.id === "yds")!;
    expect(yds.verifiedItems).toBeNull();
    expect(poolRowState(yds)).toBe("unknown");
  });
});

// ---- 3. Sağlık ölçümü → rozet ------------------------------------------------------------------

describe("altyapı: durum → Türkçe rozet", () => {
  it("rozet adları", () => {
    expect(Object.fromEntries(Object.entries(HEALTH_BADGE).map(([state, badge]) => [state, badge.label]))).toEqual({
      ok: "Çalışıyor",
      warn: "Uyarı",
      critical: "Kritik",
      down: "Erişilemiyor",
      unknown: "Ölçülemedi",
    });
    expect(HEALTH_BADGE.ok.tone).toBe("ok");
    expect(HEALTH_BADGE.down.tone).toBe("bad");
    expect(HEALTH_BADGE.unknown.tone).toBe("mute");
  });

  it("veritabanı ve depo doluluğu", () => {
    const mb = 1024 * 1024;
    expect(databaseHealth(null).state).toBe("unknown");
    expect(databaseHealth({ totalBytes: 100 * mb, limitBytes: 500 * mb, share: 0.2 }).state).toBe("ok");
    expect(databaseHealth({ totalBytes: 360 * mb, limitBytes: 500 * mb, share: 0.72 }).state).toBe("warn");
    const critical = databaseHealth({ totalBytes: 450 * mb, limitBytes: 500 * mb, share: 0.9 });
    expect(critical.state).toBe("critical");
    expect(critical.detail).toContain("%90");
    expect(storageHealth(null)).toMatchObject({ state: "unknown" });
    expect(storageHealth(null).detail).toContain("20261106170000");
    const storage = parseStorageReport({ total_bytes: 512 * mb, objects: 1200, buckets: [{ name: "documents", bytes: 500 * mb, objects: 1100 }] }, {});
    expect(storage).toMatchObject({ limitBytes: 1024 * mb, share: 0.5, objects: 1200 });
    expect(storageHealth(storage).state).toBe("ok");
    expect(storageHealth(storage).detail).toContain("1.200 dosya");
    expect(parseStorageReport(null)).toBeNull();
    expect(parseStorageReport({ total_bytes: "x" })).toBeNull();
    expect(storageLimitBytes({ SUPABASE_STORAGE_LIMIT_MB: "102400" })).toBe(102400 * mb);
  });

  it("Redis", () => {
    expect(redisHealth({ configured: false, pong: false, breakerOpen: false }).state).toBe("warn");
    expect(redisHealth({ configured: true, pong: true, breakerOpen: false }).state).toBe("ok");
    expect(redisHealth({ configured: true, pong: false, breakerOpen: false }).state).toBe("down");
    expect(redisHealth({ configured: true, pong: false, breakerOpen: true }).detail).toContain("30 sn");
  });

  it("OpenAI: kota bitti her şeyin önünde", () => {
    expect(openAiHealth({ configured: false, reach: null, quotaSeenAt: null }).state).toBe("down");
    expect(openAiHealth({ configured: true, reach: "ok", quotaSeenAt: null }).state).toBe("ok");
    expect(openAiHealth({ configured: true, reach: "ok", quotaSeenAt: "2026-11-06T09:00:00Z" }).state).toBe("critical");
    expect(openAiHealth({ configured: true, reach: "quota", quotaSeenAt: null }).state).toBe("critical");
    expect(openAiHealth({ configured: true, reach: "limited", quotaSeenAt: null }).state).toBe("warn");
    expect(openAiHealth({ configured: true, reach: "auth", quotaSeenAt: null }).state).toBe("down");
    expect(openAiHealth({ configured: true, reach: "down", quotaSeenAt: null }).state).toBe("down");
  });

  it("kart rozeti en kötü satır", () => {
    expect(worstHealth(["ok", "ok"])).toBe("ok");
    expect(worstHealth(["ok", "unknown"])).toBe("unknown");
    expect(worstHealth(["warn", "unknown", "ok"])).toBe("warn");
    expect(worstHealth(["critical", "down", "warn"])).toBe("down");
  });

  it("OpenAI yoklaması üretim çağırmaz: yalnız model listesi, yeniden deneme yok", () => {
    const probes = read("src/lib/admin/system-probes.ts");
    expect(probes).toContain("client.models.list()");
    expect(probes).toContain("maxRetries: 0");
    expect(probes).not.toMatch(/chat\.completions|responses\.create|embeddings\.create|images\.|audio\./);
    expect(probes).toContain('redisPipeline([["PING"]])');
    expect(probes).toContain('rpc("storage_size_report")');
  });
});

// ---- 4. Elle bakım: kurucu kapısı, onay, denetim kaydı -------------------------------------------

const EVICTION = { scannedPreps: 12, coldPreps: 3, evictedDocuments: 4, evictedRows: 900, skipped: null };

describe("elle bakım", () => {
  beforeEach(() => {
    state.founder = { ok: true, userId: "11111111-1111-4111-8111-111111111111" };
    state.uploads = 2;
    state.eviction = EVICTION;
    state.calls = [];
    state.audits = [];
    state.evictOptions = null;
  });

  it("yönetici (kurucu değil) çalıştıramaz: hiçbir temizlik ve kayıt yok", async () => {
    state.founder = { ok: false, error: "Bu işlem yalnız kurucuya açık." };
    expect(await runSystemMaintenance(MAINTENANCE_CONFIRM)).toEqual({ ok: false, error: "Bu işlem yalnız kurucuya açık." });
    expect(state.calls).toEqual(["founder_check"]);
  });

  it("onay sözcüğü olmadan çalışmaz", async () => {
    const result = await runSystemMaintenance("evet");
    expect(result.ok).toBe(false);
    expect(state.calls).toEqual(["founder_check"]);
  });

  it("kurucu: günlük turun iki işlevi aynı sınırlarla, sonra denetim kaydı", async () => {
    const result = await runSystemMaintenance(MAINTENANCE_CONFIRM);
    expect(state.calls).toEqual(["founder_check", "uploads", "evict", "audit"]);
    expect(state.evictOptions).toEqual({ limit: 20, budgetMs: 60_000 });
    expect(state.audits[0]).toMatchObject({
      actorId: "11111111-1111-4111-8111-111111111111",
      action: "system.maintenance_run",
      entityType: "system",
      metadata: { expired_uploads: 2, evicted_documents: 4, evicted_rows: 900, cold_preps: 3, skipped: null },
    });
    expect(result).toEqual({ ok: true, message: expect.stringContaining("2 yarım kalmış yükleme silindi") });
    expect(result.ok && result.message).toContain("4 belgenin 900 vektör satırı boşaltıldı");
  });

  it("bir adım düşse de öbürü çalışır ve kayıt yazılır", async () => {
    state.uploads = new Error("upload_cleanup_query_failed");
    const result = await runSystemMaintenance(MAINTENANCE_CONFIRM);
    expect(state.calls).toEqual(["founder_check", "uploads", "evict", "audit"]);
    expect(result.ok && result.message).toContain("Yetim yüklemeler: temizlenemedi");
    expect(state.audits[0]?.metadata).toMatchObject({ expired_uploads: null });
  });

  it("sonuç cümleleri Türkçe; anahtar kapalıysa söyler", () => {
    expect(maintenanceMessage({ expiredUploads: 0, eviction: { ...EVICTION, skipped: "flag_off", evictedDocuments: 0 } })).toBe(
      "Yetim yüklemeler: temizlenecek dosya yoktu. Soğuk vektörler: \"Soğuk belge vektörlerini boşaltma\" anahtarı kapalı olduğu için atlandı.",
    );
    expect(maintenanceMessage({ expiredUploads: 0, eviction: { ...EVICTION, evictedDocuments: 0 } })).toContain(
      "12 eski hazırlığa bakıldı, boşaltılacak belge yoktu",
    );
  });

  it("günlük bakım turu aynı işlevleri aynı sınırlarla çağırıyor; eylem yeni silme yazmıyor", () => {
    const cron = read("src/app/api/cron/subscription-renewal/route.ts");
    expect(cron).toContain("cleanupExpiredUploads(service)");
    expect(cron).toContain("evictColdEmbeddings(service, { now, limit: 20, budgetMs: 60_000 })");
    const action = read("src/app/admin/sistem/actions.ts");
    expect(action).not.toMatch(/\.delete\(|\.remove\(|\.rpc\(/);
    expect(action.indexOf("checkFounderActor()")).toBeLessThan(action.indexOf("createServiceClient()"));
    expect(read("src/app/admin/sistem/page.tsx")).toContain('founder={role === "founder"}');
  });
});

// ---- 5. İşlem kaydı etiketleri: kaynaktaki her eylemin Türkçe adı ---------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const SRC_FILES = walk("src");

describe("işlem kayıtları", () => {
  it("auditLog çağıran ya da audit_logs'a yazan her dosyadaki sabit eylemin etiketi var", () => {
    const missing: string[] = [];
    for (const file of SRC_FILES) {
      const text = read(file);
      if (!/auditLog\(|from\("audit_logs"\)/.test(text)) continue;
      for (const match of text.matchAll(/action: "([a-z_]+(?:\.[a-z_]+)+)"/g)) {
        if (!AUDIT_LABELS[match[1]!]) missing.push(`${file}: ${match[1]}`);
      }
      for (const match of text.matchAll(/action: [^,\n]*\? "([a-z_.]+)" : "([a-z_.]+)"/g)) {
        for (const action of [match[1]!, match[2]!]) if (!AUDIT_LABELS[action]) missing.push(`${file}: ${action}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("şablonla kurulan eylemlerin bütün değerleri etiketli", () => {
    for (const action of [
      "teacher.application.approved", "teacher.application.rejected",
      "admin_gate.passed", "admin_gate.wrong", "admin_gate.locked", "admin_gate.misconfigured",
      "subscription.cancelled", "subscription.resumed", "free_preview_on", "free_preview_off",
      "ops.daily_digest", "system.maintenance_run",
    ]) {
      expect(AUDIT_LABELS[action], action).toBeTruthy();
    }
  });

  it("bilinmeyen eylem ham kodla değil, 'Tanımlanmamış işlem' ile görünür; kayıt türü Türkçe", () => {
    expect(auditLabel("yepyeni.bir_sey")).toBe(UNKNOWN_AUDIT_LABEL);
    expect(entityLabel("item_bank")).toBe("Havuz sorusu");
    expect(entityLabel("bilinmeyen_tablo")).toBe("Diğer kayıt");
    expect(entityLabel(null)).toBe("—");
    expect(shortEntityId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("0f8fad5b…");
    expect(shortEntityId("maintenance")).toBe("maintenance");
    // Kodda kullanılan bütün kayıt türleri etiketli.
    const types = new Set<string>();
    for (const file of SRC_FILES) for (const match of read(file).matchAll(/entityType: "([a-z_]+)"/g)) types.add(match[1]!);
    for (const type of types) expect(ENTITY_LABELS[type], type).toBeTruthy();
    const page = read("src/app/admin/audit-log/page.tsx");
    expect(page).toContain("entityLabel(log.entity_type)");
    // Kimlik ana hücrede çıplak yazılmaz (yalnız kısaltılmış ikincil satır).
    expect(page).not.toMatch(/>\s*\{log\.entity_id\s*(\?\?[^}]*)?\}/);
  });
});

// ---- 6. Kötüye kullanım: uç adı Türkçe ------------------------------------------------------------

describe("kötüye kullanım", () => {
  it("Hız Sınırı ve Günlük Tavan adları; her sinyalin açıklaması var", () => {
    expect(ABUSE_LABELS.rate_limit).toContain("Hız Sınırı");
    expect(ABUSE_LABELS.daily_cap).toContain("Günlük Tavan");
    for (const signal of Object.keys(ABUSE_LABELS)) expect(ABUSE_EXPLANATIONS[signal], signal).toBeTruthy();
  });

  it("kaynaktaki her uç adının bir bölümü var; ham ad ana satırda yazılmaz", () => {
    const scopes = new Set<string>();
    for (const file of SRC_FILES) for (const match of read(file).matchAll(/scope: "([a-z0-9-]+)"/g)) scopes.add(match[1]!);
    expect(scopes.size).toBeGreaterThan(40);
    const unknown = [...scopes].filter((scope) => abuseScopeLabel(scope) === UNKNOWN_SCOPE_LABEL);
    // Bilinmeyen az olsun: yeni bir uç ailesi çıkarsa ABUSE_SCOPE_PREFIXES'e eklenir.
    expect(unknown.length, unknown.join(", ")).toBeLessThanOrEqual(Math.ceil(scopes.size * 0.25));
    for (const scope of Object.keys(ABUSE_SCOPE_LABELS)) expect(abuseScopeLabel(scope)).not.toBe(scope);
    expect(abuseScopeLabel("exam-prep-reschedule")).toBe("Sınav hazırlığı");
    expect(abuseScopeLabel(null)).toBe("—");
    expect(read("src/app/admin/kotuye-kullanim/page.tsx")).toContain("abuseScopeLabel(row.scope)");
  });
});

// ---- 7. Dört sayfa tamamen Türkçe -----------------------------------------------------------------

// Liste tek yerde (Gelir paketi taşıdı): tests/unit/helpers/admin-english-terms.ts
const ENGLISH_TERMS: string[] = [...ADMIN_ENGLISH_TERMS];

function visibleTexts(file: string): string[] {
  const source = read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<code>[\s\S]*?<\/code>/g, "")
    .replace(/`[^`\n]*`/g, "");
  const jsx = [...source.matchAll(/(?<![=-])>([^<>{}]*[A-Za-zÇĞİÖŞÜçğıöşü][^<>{}]*)</g)].map((match) => match[1]!.trim());
  const props = [...source.matchAll(/\b(?:title|desc|label|description|status|statusLabel|blurb)[=:]\s*"([^"]+)"/g)].map((match) => match[1]!);
  const columns = [...source.matchAll(/columns=\{\[([^\]]+)\]\}/g)].flatMap((match) => [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
  return [...jsx, ...props, ...columns].filter(Boolean);
}

const isEnglish = (text: string, term: string) => new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, "iu").test(text);

describe("Türkçe bekçisi", () => {
  it("İngilizce terim listesi ortak yardımcıdan okundu", () => {
    expect(ENGLISH_TERMS.length).toBeGreaterThan(30);
    expect(ENGLISH_TERMS).toContain("flag");
  });

  it.each([
    "src/app/admin/sistem/page.tsx",
    "src/app/admin/feature-flags/page.tsx",
    "src/app/admin/audit-log/page.tsx",
    "src/app/admin/kotuye-kullanim/page.tsx",
    "src/components/admin/maintenance-button.tsx",
  ])("%s ekranda İngilizce terim yazmıyor", (file) => {
    const texts = visibleTexts(file);
    expect(texts.length).toBeGreaterThan(3);
    for (const text of texts) {
      for (const term of ENGLISH_TERMS) expect(isEnglish(text, term), `"${text}" içinde "${term}"`).toBe(false);
    }
  });

  it("etiket sözlükleri ve rozetler Türkçe", () => {
    const texts = [
      ...Object.values(AUDIT_LABELS),
      ...Object.values(ENTITY_LABELS),
      ...Object.values(SERVICE_DISPLAY),
      ...Object.values(ABUSE_LABELS),
      ...Object.values(ABUSE_EXPLANATIONS),
      ...Object.values(ABUSE_SCOPE_LABELS),
      ...Object.values(POOL_STATE_BADGE).map((badge) => badge.label),
      ...Object.values(HEALTH_BADGE).map((badge) => badge.label),
      ...CONTENT_FAMILIES.map((family) => family.label),
      maintenanceMessage({ expiredUploads: 3, eviction: EVICTION }),
      databaseHealth(null).detail,
      redisHealth({ configured: false, pong: false, breakerOpen: false }).detail,
      openAiHealth({ configured: true, reach: "ok", quotaSeenAt: null }).detail,
    ];
    for (const text of texts) {
      for (const term of ENGLISH_TERMS) expect(isEnglish(text, term), `"${text}" içinde "${term}"`).toBe(false);
    }
  });
});

// ---- 8. Göç 20261106170000_storage_size_report.sql PGlite'ta -------------------------------------

describe("göç 20261106170000_storage_size_report.sql", () => {
  const MIGRATION = "supabase/migrations/20261106170000_storage_size_report.sql";
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb);
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  });

  afterAll(async () => {
    await db?.close();
  });

  it("yalnız ekleme: DROP, DELETE, tablo değişikliği yok", () => {
    const sql = read(MIGRATION).replace(/^--.*$/gm, "");
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bALTER TABLE\b|\bTRUNCATE\b/i);
  });

  it("boş depoda sıfır, dolu depoda kova kova toplam; yalnız service_role", async () => {
    await db.exec(read(MIGRATION));
    const empty = await db.query<{ r: { total_bytes: number; objects: number; buckets: unknown[] } }>("SELECT public.storage_size_report() AS r");
    expect(empty.rows[0]!.r).toEqual({ total_bytes: 0, objects: 0, buckets: [] });
    await db.exec(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
      ('documents', 'a/1.pdf', '{"size": 1000}'), ('documents', 'a/2.pdf', '{"size": 3000}'),
      ('lesson-audio', 'x.mp3', '{"size": 500}'), ('lesson-audio', 'klasor/', NULL);`);
    const full = await db.query<{ r: { total_bytes: number; objects: number; buckets: { name: string; bytes: number; objects: number }[] } }>(
      "SELECT public.storage_size_report() AS r",
    );
    const report = full.rows[0]!.r;
    expect(report.total_bytes).toBe(4500);
    expect(report.objects).toBe(4);
    expect(report.buckets).toEqual([
      { name: "documents", bytes: 4000, objects: 2 },
      { name: "lesson-audio", bytes: 500, objects: 2 },
    ]);
    expect(parseStorageReport(report, {})?.share).toBeCloseTo(4500 / (1024 * 1024 * 1024));
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT public.storage_size_report()")).rejects.toThrow(/permission denied/i);
    await db.exec("RESET ROLE; SET ROLE service_role");
    await expect(db.query("SELECT public.storage_size_report()")).resolves.toBeTruthy();
    await db.exec("RESET ROLE");
  });
});
