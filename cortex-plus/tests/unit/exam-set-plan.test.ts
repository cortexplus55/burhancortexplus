import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExamScheduleV2, type ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";
import { turkishTitleCase } from "@/lib/documents/outline-clean";

/*
  19 Ekim 2026, 7 dosyalık AYT Biyoloji sınav seti (65 sayfa PDF + 6 sayfa Word + 5 fotoğraf),
  sınav 25 gün sonra. Sihirbaz 29 konuluk doğru bir harita gösterdi ("Yol bu listeyle kurulur");
  kurulan hazırlıkta:
    - yol "Dinlenme Potansiyeli"yle başladı, "Sinir Dokusu, Nöron Yapısı" yedinci sıraya düştü;
    - 29 konunun 9'u sayfasız kaldı, "İnce Bağırsakta Sindirim" nefron sayfalarını aldı (kurulum
      haritayı değil eski birleştirmeyi okuyordu);
    - takvim yalnız hafta içini saydı (25 gün → 18 gün), ilk konular üçer test aldı ve son on konunun
      dersi testsiz olarak son güne yığıldı.
*/

const TITLES = [
  "Sinir Dokusu, Nöron Yapısı ve Nöron Çeşitleri",
  "Dinlenme Potansiyeli ve Aksiyon Potansiyeli",
  "Refrakter Dönem ve İmpulsun Tek Yönlü İlerlemesi",
  "Sinaps ve Nörotransmitterler",
  "Merkezi Sinir Sistemi, Refleks ve Otonom Sinir Sistemi",
  "Hormonların Özellikleri, Hipotalamus ve Hipofiz",
  "Tiroit, Paratiroit ve Böbrek Üstü Bezleri",
  "Pankreas, Eşey Bezleri ve Diğer Hormon Kaynakları",
  "Negatif ve Pozitif Geri Bildirim",
  "Reseptörler ve Göz",
  "Kulakta İşitme ve Denge",
  "Koku, Tat ve Deri Duyuları",
  "Kıkırdak, Kemik, Eklem ve İskelet",
  "Kas Çeşitleri, Sarkomer ve Kasılma",
  "Sindirim Çeşitleri, Ağız ve Mide",
  "İnce Bağırsakta Sindirim ve Emilim",
  "Karaciğer ve Sindirimin Hormonal Kontrolü",
  "Kalbin Yapısı ve Uyarı İletim Sistemi",
  "EKG Aralıkları ve Kalp Uyarısı",
  "Dolaşım, Damarlar ve Kan Basıncı",
  "Kan, Lenf ve Pıhtılaşma",
  "Bağışıklık ve Aşı-serum Farkı",
  "Solunum Yolları ve Soluk Alıp Verme",
  "Gaz Değişimi, Kanda Taşınma ve Solunum Kontrolü",
  "Azotlu Atıklar, Böbrek ve Nefron Yapısı",
  "Süzülme, Geri Emilim ve Salgılama",
  "ADH, Aldosteron ve Böbreğin Homeostazideki Rolü",
  "Su-tuz Dengesi Senaryoları ve ANP",
  "Kan Şekeri, pH ve Egzersizde Sistemlerin Birlikte Çalışması",
];

// "Sınavda sık çıkar" rozetli konular (haritada examWeight high) ağırlıklı.
const topics: ScheduleTopicInput[] = TITLES.map((title, index) => ({
  id: `t${index}`,
  title,
  pageNumbers: [index * 2 + 1, index * 2 + 2, ...(index % 3 === 0 ? [index * 2 + 3] : [])],
  measuredLevel: "unknown",
  examHeavy: index !== 2 && index % 2 === 1,
  importance: index % 2 === 1 ? "important" : "medium",
}));

const plan = (studyDays: number[]) =>
  buildExamScheduleV2({
    daysToExam: 25,
    dailyMinutes: 45,
    studyDays,
    topics,
    keepOrder: true,
    fromDate: new Date("2026-10-19T20:00:00Z"),
  });

describe("sınav seti: yol öğrencinin listesiyle kurulur", () => {
  it("takvim listeyi yeniden dizmez; yol konu konu, listedeki sırayla", () => {
    const schedule = plan([1, 2, 3, 4, 5, 6, 7]);
    const lessonOrder = schedule.sessions
      .filter((session) => session.role === "learn")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((session) => session.topicTitle);
    expect([...new Set(lessonOrder)]).toEqual(TITLES);
    // Bir konunun bütün işleri, sonraki konunun dersinden önce gelir (kilitli yol sırayla açılır).
    const ordered = [...schedule.sessions].sort((a, b) => a.sortOrder - b.sortOrder);
    const topicRuns = ordered.filter((s) => s.role !== "mock").map((s) => s.topicId);
    const firstSeen = topicRuns.filter((id, index) => topicRuns.indexOf(id) === index);
    expect(firstSeen).toEqual(topics.map((topic) => topic.id));
    for (const id of firstSeen) {
      const at = topicRuns.map((value, index) => (value === id ? index : -1)).filter((index) => index >= 0);
      expect(at[at.length - 1]! - at[0]!).toBe(at.length - 1);
    }
    expect(ordered[ordered.length - 1]!.role).toBe("mock");
    expect(ordered.map((s) => s.sortOrder)).toEqual(ordered.map((_, index) => index));
  });

  it("25 günün hepsi kullanılır; her konunun dersi ve en az bir testi var", () => {
    const schedule = plan([1, 2, 3, 4, 5, 6, 7]);
    expect(schedule.studyDayDates).toHaveLength(25);
    for (const title of TITLES) {
      const mine = schedule.sessions.filter((session) => session.topicTitle === title);
      expect(mine.some((session) => session.role === "learn")).toBe(true);
      expect(mine.some((session) => session.role === "practice")).toBe(true);
    }
  });

  it("son güne ders yığılmaz: hiçbir güne üçten fazla yeni ders düşmez", () => {
    for (const days of [[1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5]]) {
      const schedule = plan(days);
      const lessonsByDay = new Map<number, number>();
      for (const session of schedule.sessions) {
        if (session.role !== "learn") continue;
        lessonsByDay.set(session.dayIndex, (lessonsByDay.get(session.dayIndex) ?? 0) + 1);
      }
      expect(Math.max(...lessonsByDay.values())).toBeLessThanOrEqual(3);
      const lastDay = schedule.studyDayDates.length;
      expect(schedule.sessions.some((s) => s.dayIndex === lastDay && s.role === "learn")).toBe(false);
      for (const title of TITLES) {
        expect(schedule.sessions.some((s) => s.topicTitle === title && s.role === "practice")).toBe(true);
      }
    }
  });

  it("ağırlıklı konunun ek testi ilk konulara yığılmaz, kalan süreye girer", () => {
    const schedule = plan([1, 2, 3, 4, 5, 6, 7]);
    const lastLesson = Math.max(...schedule.sessions.filter((s) => s.role === "learn").map((s) => s.dayIndex));
    // Son konunun dersi deneme gününden en az bir gün önce.
    expect(lastLesson).toBeLessThan(schedule.studyDayDates.length);
  });

  it("kurulum haritayı okur ve sırasını korur; çalışma günü sorulmadıysa her gün", () => {
    const loader = readFileSync("src/lib/learning/prep-schedule-topics.ts", "utf8");
    expect(loader).toContain("loadOneshotIntakeTopics(service, userId, documentIds)");
    expect(loader).toContain("orderTopicsForPath(weighted, { manualOrder: Boolean(outline) })");
    const create = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(create).toContain("loaded.fromOutline === true");
    expect(create).toContain("keepOrder: true");
    expect(create).toContain("[1, 2, 3, 4, 5, 6, 7]");
    expect(create).toContain("study_days: studyDays");
  });
});

describe("başlıkta kendi yazımı olan kelime", () => {
  it("pH, mRNA, DNA bozulmaz", () => {
    expect(turkishTitleCase("Kan şekeri, pH ve egzersiz")).toBe("Kan Şekeri, pH ve Egzersiz");
    expect(turkishTitleCase("mRNA ve DNA sentezi")).toBe("mRNA ve DNA Sentezi");
  });

  it("bağıran başlık yine başlık biçimine iner", () => {
    expect(turkishTitleCase("KAN ŞEKERİ VE EGZERSİZ")).toBe("Kan Şekeri ve Egzersiz");
  });
});

describe("ders ekranındaki 'N kaynak'", () => {
  it("konuya bağlı etkinlikte konunun dosyaları ve sayfaları", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(page).toContain('.select("id, label, familiarity, source_refs")');
    expect(page).toContain("TOPIC_SCOPED_KINDS.has(node.kind as PlanNodeKind)");
    expect(page).toContain("sourceIds.filter((id) => topicPages.has(id) || supportByDoc.has(id))");
    const dialog = readFileSync("src/components/parity/node-sources.tsx", "utf8");
    expect(dialog).toContain("source.pages");
  });
});
