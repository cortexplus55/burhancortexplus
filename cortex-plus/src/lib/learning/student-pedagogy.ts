import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TUTOR_STYLE, parseTutorStyle, tutorStyleLabel, type TutorStyle } from "@/lib/learning/tutor-style";

/**
 * Öğrencinin pedagojik profili (25 Ekim 2026): kayıtta verdiği sınıf, hedef sınav ve anlatım tercihi.
 * Sohbet `tutor_style`'ı yıllardır okuyordu; ders, test, doğru/yanlış, podcast, kartlar, sözlü ve
 * fotoğraftan çözüm okumuyordu — TUS öğrencisi de LGS öğrencisi de aynı dersi alıyordu.
 *
 * Profil yalnız anlatımın dilini, derinliğini, örnek türünü ve soru biçimini değiştirir; kaynak ve
 * doğruluk kuralları aynen kalır. Blok motor kabuklarında sistem isteminin **sonuna** eklenir: uzun sabit
 * önek önbellekte kalsın, profil yoksa istem bayt bayt aynı olsun.
 */

export const GRADE_LEVELS = [
  "5. sınıf",
  "6. sınıf",
  "7. sınıf",
  "8. sınıf",
  "9. sınıf",
  "10. sınıf",
  "11. sınıf",
  "12. sınıf",
  "Mezun",
] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const TARGET_EXAMS = ["YKS", "LGS", "KPSS", "TUS", "ALES", "Okul sınavları"] as const;
export type TargetExam = (typeof TARGET_EXAMS)[number];

export type StudentPedagogicalContext = {
  gradeLevel: GradeLevel | null;
  targetExam: TargetExam | null;
  tutorStyle: TutorStyle;
  /** Kayıtta seçilen odak ders ("Matematik", "Tarih"); yoksa null. */
  focusSubject: string | null;
};

/** Profilin okunduğu yüzey: aynı profil derste anlatımı, testte soru kökünü, çözümde adımı değiştirir. */
export type PedagogySurface = "lesson" | "quiz" | "true_false" | "podcast" | "cards" | "oral" | "solve";

/** "12. sınıf", "12.sınıf", "12", "mezun" → kayıt seçeneği; tanınmayan değer yok sayılır. */
export function parseGradeLevel(value: unknown): GradeLevel | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLocaleLowerCase("tr");
  if (!text) return null;
  if (text.includes("mezun")) return "Mezun";
  const grade = text.match(/^(\d{1,2})\s*\.?\s*(?:sınıf)?$/u);
  const n = grade ? Number(grade[1]) : NaN;
  return n >= 5 && n <= 12 ? (`${n}. sınıf` as GradeLevel) : null;
}

/** Odak ders: boş, çok uzun ya da sayısal değer yok sayılır. */
export function parseFocusSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > 60) return null;
  if (/^\d+$/.test(text)) return null;
  return text;
}

/** Kayıttaki hedef ("YKS hazırlık", "TUS hazırlık", "Okul sınavları") ya da serbest metinden sınav. */
export function detectTargetExam(value: unknown): TargetExam | null {
  if (typeof value !== "string") return null;
  const text = value.toLocaleLowerCase("tr");
  if (/(?:^|[^\p{L}])tus(?:$|[^\p{L}])|tıpta uzmanlık/u.test(text)) return "TUS";
  if (/(?:^|[^\p{L}])(?:yks|tyt|ayt|ydt)(?:$|[^\p{L}])|üniversite sınavı/u.test(text)) return "YKS";
  if (/(?:^|[^\p{L}])lgs(?:$|[^\p{L}])|liseye geçiş/u.test(text)) return "LGS";
  if (/(?:^|[^\p{L}])kpss(?:$|[^\p{L}])|kamu personel/u.test(text)) return "KPSS";
  if (/(?:^|[^\p{L}])ales(?:$|[^\p{L}])|lisansüstü/u.test(text)) return "ALES";
  if (/okul sınav|yazılı|sözlü/u.test(text)) return "Okul sınavları";
  return null;
}

const CACHE_MS = 60_000;
const READ_TIMEOUT_MS = 1_500;
const cache = new Map<string, { at: number; value: StudentPedagogicalContext | null }>();

/** Yalnız testler: bellekteki profil önbelleğini boşaltır. */
export function clearStudentPedagogyCache(): void {
  cache.clear();
}

/**
 * Profil + kayıttaki ilk hedef. Okunamazsa (tablo yok, ağ, süre aşımı) null: içerik profilsiz, eskisi gibi
 * yazılır — profil yüzünden hiçbir üretim düşmez ya da beklemez. Bir dakika bellekte tutulur (bir ders
 * yazımı aynı profili yazar, denetçi ve düzeltme için defalarca okur).
 */
export async function getStudentPedagogicalContext(
  userId: string,
  client?: SupabaseClient,
): Promise<StudentPedagogicalContext | null> {
  if (!userId) return null;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: StudentPedagogicalContext | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const service = client ?? (await import("@/lib/supabase/server")).createServiceClient();
    const read = Promise.all([
      service.from("profiles").select("grade_level, tutor_style, focus_subject").eq("id", userId).maybeSingle(),
      service.from("learning_goals").select("goal_text").eq("user_id", userId).order("created_at").limit(1).maybeSingle(),
    ]);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
    });
    const result = await Promise.race([read, timeout]);
    if (result) {
      const [profile, goal] = result as [
        { data: { grade_level?: unknown; tutor_style?: unknown; focus_subject?: unknown } | null },
        { data: { goal_text?: unknown } | null },
      ];
      const gradeLevel = parseGradeLevel(profile?.data?.grade_level);
      const targetExam = detectTargetExam(goal?.data?.goal_text);
      const tutorStyle = parseTutorStyle(profile?.data?.tutor_style);
      const focusSubject = parseFocusSubject(profile?.data?.focus_subject);
      const told =
        gradeLevel || targetExam || focusSubject || (profile?.data?.tutor_style && tutorStyle !== DEFAULT_TUTOR_STYLE);
      value = told ? { gradeLevel, targetExam, tutorStyle, focusSubject } : null;
    }
  } catch {
    value = null;
  } finally {
    if (timer) clearTimeout(timer);
  }
  cache.set(userId, { at: Date.now(), value });
  return value;
}

const EXAM_LINES: Record<TargetExam, Partial<Record<PedagogySurface | "default", string>>> = {
  TUS: {
    default:
      "TUS düzeyi: klinik vaka ve spot bilgi derinliği. Bilgi hasta üzerinden kurulur (yaş, başvuru yakınması, bulgu → " +
      "tanı, ilk yapılacak, en olası); 'en sık', 'ilk tercih', 'altın standart', 'patognomonik' türü spot bilgi ve ayırıcı " +
      "tanı ipucu öne çıkar; terim tıbbi adıyla yazılır. Vakadaki her bulgu ve sayı kaynaktan gelir.",
    quiz:
      "TUS düzeyi: kökler klinik vaka ('… yaşında hasta … ile başvuruyor; en olası tanı / ilk yapılması gereken hangisidir?') " +
      "ya da spot bilgi ('en sık', 'ilk tercih', 'altın standart') sorar; çeldiriciler ayırıcı tanıdaki komşu tablolardır. " +
      "Vakadaki her bulgu ve sayı kaynaktan gelir.",
    solve: "TUS düzeyi: çözüm klinik akıl yürütmeyle gider (bulgu → ayırıcı tanı → sonuç); spot bilgiyi açıkça söyle.",
  },
  YKS: {
    default:
      "YKS (TYT/AYT) düzeyi: ÖSYM tarzı. Anlatım kavramın sınavda hangi tuzakla sorulduğunu söyler; örnekler ÖSYM'nin " +
      "sorduğu biçimde kurulur, çeldiriciler öğrencinin gerçek kavram yanılgısıdır.",
    quiz:
      "YKS (TYT/AYT) düzeyi: ÖSYM tarzı. Uygun olan sorular öncüllüdür (kökte ayrı satırlarda I., II., III. ifadeler; şıklar " +
      "'Yalnız I', 'I ve II', 'I, II ve III' gibi) ya da 'kesinlikle doğrudur / ulaşılamaz' köklüdür; çeldiriciler öğrencinin " +
      "gerçek kavram yanılgısından kurulur. Açıklama öncülü Romen numarasıyla anar ('II. öncül'); şıklara sırasıyla değil.",
    solve: "YKS düzeyi: ÖSYM sorusu gibi çöz; en kısa güvenilir yolu ve çeldiricinin nereden geldiğini göster.",
  },
  LGS: {
    default:
      "LGS / ortaokul düzeyi: somut, günlük hayattan benzetmeler (mutfak, oyun, alışveriş, okul yolu) ve kısa cümleler; " +
      "soyut terimi önce tanıdık bir örnekle aç, sonra adını ver. Benzetme kaynakta olmayan bilgi taşımaz.",
    quiz:
      "LGS düzeyi: beceri temelli kökler — kısa bir günlük durumu ya da tabloyu okutan, yorum isteyen sorular; dil sade, " +
      "cümleler kısa.",
    solve: "LGS düzeyi: sade dil, kısa adımlar; her adımı günlük bir örnekle bağla.",
  },
  KPSS: {
    default:
      "KPSS düzeyi: bilgi ve ayırt etme ağırlıklı. Benzer kavram, kurum ve madde ayrımları açıkça yapılır; tarih, sayı ve " +
      "madde bilgisi kaynaktaki hâliyle net verilir; sık karıştırılan ikililer yan yana ayrılır.",
    quiz:
      "KPSS düzeyi: ayırt etme kökleri ('hangisi … değildir / yanlıştır'), eşleştirme ve bilgi soruları; çeldiriciler sık " +
      "karıştırılan komşu kavram, kurum ya da maddedir.",
  },
  ALES: {
    default:
      "ALES düzeyi: akıl yürütme ve hız. Kural, işlem kısayolu ve mantık adımları kısa ve uygulanabilir verilir; her çözüm " +
      "en kısa güvenilir yoldan gider.",
    quiz: "ALES düzeyi: kökler çıkarım ve yorum ister; işlem sorusunda kısa yol açıklamada gösterilir.",
  },
  "Okul sınavları": {
    default: "Okul sınavı düzeyi: ders kitabının dili; tanım, örnek ve kısa açıklama; terimler tam adıyla.",
    quiz: "Okul sınavı düzeyi: yazılı sorusuna benzer açık, net kökler; tanım, örnek ve neden soruları.",
  },
};

function gradeLine(grade: GradeLevel): string {
  if (grade === "Mezun") {
    return "Üniversite / mezun düzeyi: doğrudan teknik yöntem, teorem ya da kanun adımları ve sınav veya vaka çözümü. Edebi giriş yok.";
  }
  const n = Number.parseInt(grade, 10);
  if (n >= 5 && n <= 8) {
    return `${grade} (ortaokul): ağır cebir adı ve akademik jargon yok. Somut günlük modeller (terazi, sayı doğrusu, örüntü) ve çok kısa cümleler. Edebi giriş yok.`;
  }
  if (n >= 9 && n <= 12) {
    return `${grade} (lise): MEB ve ÖSYM kazanımı, öncül tuzağı ve kısa çözüm yolu. Edebi giriş yok.`;
  }
  return `${grade} öğrencisi: sınav odaklı. Edebi giriş yok.`;
}

function bandLine(exam: TargetExam | null): string | null {
  if (exam === "TUS" || exam === "KPSS" || exam === "ALES") {
    return "Üniversite / sınav düzeyi: doğrudan teknik yöntem, teorem veya kanun adımları ve vaka. Edebi giriş ve boş laf yok.";
  }
  if (exam === "YKS") return "Lise / YKS: kazanım, öncül tuzağı ve pratik çözüm yolu. Edebi giriş yok.";
  if (exam === "LGS") return "Ortaokul: somut model (terazi, sayı doğrusu, örüntü), kısa cümle, ağır cebir adı yok. Edebi giriş yok.";
  return null;
}

const STYLE_LINES: Record<TutorStyle, Record<"teach" | "ask" | "solve", string>> = {
  step_by_step: {
    teach: "Anlatım tercihi adım adım: çözümlü örnek ve süreçte hiçbir adımı atlama, her adımın nedenini söyle.",
    ask: "Anlatım tercihi adım adım: açıklama önce dayandığı bilgiyi, sonra adımı, sonra sonucu söyler.",
    solve: "Anlatım tercihi adım adım: her adımın neden yapıldığını yaz; adım atlama.",
  },
  hints_first: {
    teach:
      "Anlatım tercihi önce ipucu: öğrenciyi önce düşündür; açıklamalar (explanation, optionWhy) önce takılınacak yeri " +
      "ipucu olarak söyler, sonra nedeni verir.",
    ask: "Anlatım tercihi önce ipucu: açıklama önce takılınacak noktayı ipucu olarak söyler, sonra doğru cevabın nedenini.",
    solve:
      "Anlatım tercihi önce ipucu: ilk adım çözümün anahtar fikrini ipucu olarak söyler (sonucu vermeden); sonraki adımlar " +
      "tam çözümü verir.",
  },
  direct_solve: {
    teach: "Anlatım tercihi doğrudan: kuralı ve sonucu önce söyle, gerekçeyi kısa tut; dolgu cümlesi yok.",
    ask: "Anlatım tercihi doğrudan: açıklama kısa; doğru cevabın nedeni bir-iki cümle.",
    solve: "Anlatım tercihi doğrudan: en kısa güvenilir yoldan çöz; gereksiz adım yok.",
  },
};

const SURFACE_LINES: Partial<Record<PedagogySurface, string>> = {
  podcast: "Podcastte profil konuşmanın örneklerini ve derinliğini belirler; konuşma kuralları aynen kalır.",
  cards: "Kartlarda profil ön yüzün soru biçimini ve arka yüzün derinliğini belirler; kart kuralları aynen kalır.",
};

function examLine(exam: TargetExam, surface: PedagogySurface): string | undefined {
  const lines = EXAM_LINES[exam];
  const askLike = surface === "quiz" || surface === "true_false" || surface === "oral";
  return (surface === "solve" ? lines.solve : askLike ? lines.quiz : undefined) ?? lines.default;
}

/**
 * Sistem isteminin sonuna eklenecek profil bloğu (saf). Yazar, düzeltici ve denetçi aynı metni okur;
 * denetçi için profil bir denetim maddesi değildir — "yazar ve denetçiye farklı kural" çelişkisi kurulmasın.
 */
export function pedagogyPromptBlock(context: StudentPedagogicalContext | null, surface: PedagogySurface): string {
  if (!context) return "";
  const facts = [
    context.gradeLevel ? `Sınıf: ${context.gradeLevel}` : null,
    context.targetExam ? `Hedef sınav: ${context.targetExam}` : null,
    context.focusSubject ? `Odak ders: ${context.focusSubject}` : null,
    `Anlatım tercihi: ${tutorStyleLabel(context.tutorStyle)}`,
  ].filter(Boolean);
  const styleKey = surface === "solve" ? "solve" : surface === "quiz" || surface === "true_false" || surface === "oral" ? "ask" : "teach";
  const lines = [
    `ÖĞRENCİ PROFİLİ (kayıt bilgisi): ${facts.join(" · ")}.`,
    "Profil anlatımın dilini, derinliğini ve örnek türünü belirler ve buna uyulur. Ortaokulda ağır cebir adı ve akademik jargon yok; " +
      "lisede kazanım ve kısa çözüm; üniversitede teknik yöntem. Edebi giriş ve boş laf yok. " +
      "Belgede olmayan standart sınav bilgisi 'Sınav Müfredatı Tamamlaması' kutusunda etiketli kalır; profil bu kutuyu yasaklamaz. " +
      "Hazırlığın SINAV satırı başka bir sınav söylüyorsa o sınavın biçimini izle.",
    context.targetExam ? examLine(context.targetExam, surface) : null,
    bandLine(context.targetExam),
    context.gradeLevel ? gradeLine(context.gradeLevel) : null,
    context.focusSubject
      ? `Odak ders ${context.focusSubject}: örnekleri ve terimleri bu dersin dilinden kur; başka derse sapma.`
      : null,
    STYLE_LINES[context.tutorStyle][styleKey],
    SURFACE_LINES[surface] ?? null,
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

/** Sistem istemine profil bloğunu ekler; blok boşsa istem aynen döner. */
export function withStudentProfile(system: string, block: string): string {
  return block ? `${system}\n\n${block}` : system;
}

/** Motor kabukları için: profil bloğu ya da boş metin. Hiçbir zaman atmaz. */
export async function studentPedagogyBlock(
  client: SupabaseClient,
  userId: string,
  surface: PedagogySurface,
): Promise<string> {
  try {
    return pedagogyPromptBlock(await getStudentPedagogicalContext(userId, client), surface);
  } catch {
    return "";
  }
}
