/*
  İçerik havuzunun sınav aileleri (6 Kasım 2026, yönetim paneli · Sistem Sağlığı).

  Aileye eşleme TEK YERDE ve programın kendi türünden (`kind`, kayıt defteri `registry.json`): program kimliğinden
  ya da adından tahmin yok. Yeni bir program türü eklenirse bekçi (`yonetim-sistem.test.ts`) "eşlenmemiş program"
  der; o zaman buraya bir satır eklenir. Saf modül: sunucu ve test aynı işlevi okur.
*/

export type ContentFamilyId = "yks" | "lgs" | "meb" | "kpss" | "tus" | "dus" | "ales" | "dgs" | "yds";

export type ContentFamily = { id: ContentFamilyId; label: string; kinds: string[] };

/** Ekrandaki sıra da bu. */
export const CONTENT_FAMILIES: ContentFamily[] = [
  { id: "yks", label: "YKS", kinds: ["yks"] },
  { id: "lgs", label: "LGS", kinds: ["lgs"] },
  { id: "meb", label: "MEB 5–12. sınıf", kinds: ["okul"] },
  { id: "kpss", label: "KPSS", kinds: ["kpss"] },
  { id: "tus", label: "TUS", kinds: ["tus"] },
  { id: "dus", label: "DUS", kinds: ["dus"] },
  { id: "ales", label: "ALES", kinds: ["ales"] },
  { id: "dgs", label: "DGS", kinds: ["dgs"] },
  { id: "yds", label: "YDS", kinds: ["yds"] },
];

const BY_KIND = new Map(CONTENT_FAMILIES.flatMap((family) => family.kinds.map((kind) => [kind, family] as const)));

export function familyOfKind(kind: string): ContentFamily | null {
  return BY_KIND.get(kind) ?? null;
}

export type ProgramUnits = { id: string; kind: string; unitCount: number };

export type FamilyPrograms = ContentFamily & { programIds: string[]; units: number };

/** Programları ailelere toplar; eşlenmeyen programlar ayrıca döner (ekranda uyarı, testte hata). */
export function groupProgramsByFamily(programs: ProgramUnits[]): { families: FamilyPrograms[]; unmapped: string[] } {
  const families = CONTENT_FAMILIES.map((family) => ({ ...family, programIds: [] as string[], units: 0 }));
  const index = new Map(families.map((family) => [family.id, family]));
  const unmapped: string[] = [];
  for (const program of programs) {
    const family = familyOfKind(program.kind);
    const row = family ? index.get(family.id) : undefined;
    if (!row) {
      unmapped.push(program.id);
      continue;
    }
    row.programIds.push(program.id);
    row.units += program.unitCount;
  }
  return { families, unmapped };
}

/** Aile satırının ölçümü; okunamayan sayı null ("ölçülemedi"). */
export type FamilyPoolCounts = {
  lessonUnits: number | null;
  verifiedItems: number | null;
  quarantinedItems: number | null;
  staleItems: number | null;
};

export type FamilyPoolRow = FamilyPrograms & FamilyPoolCounts;

export type PoolRowState = "full" | "partial" | "empty" | "unknown";

/** Satırın durumu: bütün ünitelerin doğrulanmış dersi ve en az bir doğrulanmış soru varsa tam. */
export function poolRowState(row: Pick<FamilyPoolRow, "units" | "lessonUnits" | "verifiedItems">): PoolRowState {
  if (row.lessonUnits === null || row.verifiedItems === null) return "unknown";
  if (row.units === 0) return "empty";
  if (row.lessonUnits >= row.units && row.verifiedItems > 0) return "full";
  if (row.lessonUnits === 0 && row.verifiedItems === 0) return "empty";
  return "partial";
}

export const POOL_STATE_BADGE: Record<PoolRowState, { tone: "ok" | "warn" | "bad" | "mute"; label: string }> = {
  full: { tone: "ok", label: "Tam" },
  partial: { tone: "warn", label: "Eksik var" },
  empty: { tone: "bad", label: "Boş" },
  unknown: { tone: "mute", label: "Ölçülemedi" },
};

/** Ders kapsama oranı (yüzde, tam sayı); aynı ünitenin iki doğrulanmış sürümü %100'ü aşırmasın. */
export function lessonCoverage(row: Pick<FamilyPoolRow, "units" | "lessonUnits">): number | null {
  if (row.lessonUnits === null || row.units === 0) return null;
  return Math.round((Math.min(row.lessonUnits, row.units) / row.units) * 100);
}
