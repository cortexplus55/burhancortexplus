/**
 * Müfredat dizininin grup başlığı (19 Kasım 2026, Faz 3): sınav programları kendi adıyla, okul programları sınıfıyla.
 * Önce yalnız YKS/LGS/KPSS adlandırılıyordu; ALES, DGS, YDS, TUS, DUS'un sınıfı olmadığı için başlık "null. sınıf"
 * çıkıyordu. Sınıfı olmayan tanınmayan tür de büyük harfli kendi adıyla yazılır; "null"/"undefined" hiçbir zaman.
 */
const KIND_GROUP: Record<string, string> = {
  yks: "YKS (TYT / AYT)",
  lgs: "LGS",
  kpss: "KPSS",
  ales: "ALES",
  dgs: "DGS",
  yds: "YDS",
  tus: "TUS",
  dus: "DUS",
};

export function programGroupLabel(program: { kind?: string | null; grade?: number | string | null }): string {
  const kind = String(program.kind ?? "").trim().toLowerCase();
  if (KIND_GROUP[kind]) return KIND_GROUP[kind];
  const grade = Number(program.grade);
  if (program.grade != null && program.grade !== "" && Number.isFinite(grade) && grade > 0) return `${grade}. sınıf`;
  return kind && kind !== "okul" ? kind.toLocaleUpperCase("tr-TR") : "Diğer programlar";
}
