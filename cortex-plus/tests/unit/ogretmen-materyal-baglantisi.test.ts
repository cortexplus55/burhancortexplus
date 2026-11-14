import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  actionMarker,
  buildChatActions,
  detectChatIntent,
  matchChatMaterial,
  materialTurnLines,
  optionCountLine,
  readTeacherTone,
  splitActionMarkers,
  stripModelActionMarkers,
  type ChatMaterialIndex,
} from "@/lib/ai/chat-material-link";
import { resolveChatMaterial } from "@/lib/ai/chat-material-load";
import { resolveOptionCount } from "@/lib/learning/student-pedagogy";

/*
  `/ogretmen` canlı stres testi (15 Kasım 2026): öğrenci "Sor" çubuğundan kendi notundan özet istedi; hazırlık ve belge
  hesabında yüklüyken sohbet "Genel" modda açıldı, öğretmen "not bu sohbette görünmüyor, yeniden yükle" dedi; test
  isteyince sohbete düz yazı 4 şıklı soru döktü; kafası karışan öğrenciye soğuk açılış, benzetme yok.

  Örnekler bilerek başka derslerden (eşleştirme kod içinde ders adı bilmez; adlar öğrencinin kayıtlarından gelir).
*/

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

const INDEX: ChatMaterialIndex = {
  preps: [
    {
      id: P1,
      title: "Hücre Bölünmesi ve Kalıtım",
      subject: null,
      daysLeft: 25,
      topics: [
        { id: "t1", label: "Mitoz Bölünme", documentTopicNodeId: null },
        { id: "t2", label: "Mayoz ve Krossing Over", documentTopicNodeId: null },
      ],
    },
    {
      id: P2,
      title: "Elektrik Devreleri",
      subject: null,
      daysLeft: 25,
      topics: [{ id: "t3", label: "Ohm Yasası ve Direnç", documentTopicNodeId: null }],
    },
    { id: P3, title: "Osmanlı Kuruluş Dönemi", subject: null, daysLeft: 0, topics: [] },
  ],
  documents: [{ id: "d1", name: "termodinamik-ders-notu.pdf" }],
};

describe("mesaj ↔ öğrencinin hazırlığı, konusu, belgesi", () => {
  it("konu başlığı geçince o hazırlık ve konu (prepId gelmese de)", () => {
    const match = matchChatMaterial("Yüklediğim mayoz bölünme notundan bana özet çıkart", INDEX);
    expect(match.reason).toBe("named");
    expect(match.preps.map((item) => item.prep.id)).toEqual([P1]);
    expect(match.preps[0]!.topic?.label).toBe("Mayoz ve Krossing Over");
    expect(match.materialCue).toBe(true);
  });

  it("hazırlığın adı geçince o hazırlık (ekler önemli değil)", () => {
    const match = matchChatMaterial("Elektrik devrelerinden 5 soruluk test hazırla", INDEX);
    expect(match.preps.map((item) => item.prep.id)).toEqual([P2]);
  });

  it("belge adı geçince belge (hazırlığa bağlı olmasa da)", () => {
    const match = matchChatMaterial("Termodinamik notumdan formülleri çıkar", INDEX);
    expect(match.documents.map((doc) => doc.id)).toEqual(["d1"]);
  });

  it("'N gün sonraki sınavlarım' sınav tarihine bağlanır; aynı gün iki sınav ikisi de", () => {
    const match = matchChatMaterial("25 gün sonraki sınavlarımdan bir özet çıkar", INDEX);
    expect(match.reason).toBe("days");
    expect(match.preps.map((item) => item.prep.id).sort()).toEqual([P1, P2].sort());
    expect(matchChatMaterial("bugünkü sınavım için son tekrar", INDEX).preps[0]!.prep.id).toBe(P3);
  });

  it("ad yoksa ana ekranda seçili hazırlık; listede olmayan kimlik yok sayılır", () => {
    expect(matchChatMaterial("bunu bana anlat", INDEX, { contextPrepId: P2 })).toMatchObject({ reason: "context" });
    expect(matchChatMaterial("bunu bana anlat", INDEX, { contextPrepId: "99999999-9999-4999-8999-999999999999" }).reason).toBe("none");
  });

  it("genel sözcükler ('ders', 'not', 'sınav', 'özet') tek başına eşleşme sayılmaz", () => {
    expect(matchChatMaterial("bana sınav öncesi bir özet çıkar", INDEX).preps).toEqual([]);
  });
});

describe("niyet: özet ve sekiz çalışma aracı", () => {
  it.each([
    ["Bana sınav öncesi net bir özet çıkart", { summary: true, tool: null }],
    ["Bu konudan 5 soruluk tuzaklı bir test hazırla", { summary: false, tool: "quiz" }],
    ["Deneme sınavı yapalım", { summary: false, tool: "written" }],
    ["Kartlarla tekrar edeyim", { summary: false, tool: "flashcards" }],
    ["Doğru yanlış sor", { summary: false, tool: "true_false" }],
    ["Bunun podcast'ini yap", { summary: false, tool: "podcast" }],
    ["Beni sözlü yap", { summary: false, tool: "oral" }],
    ["Çizimli video istiyorum", { summary: false, tool: "video" }],
    ["Sınav sabahı kağıdını aç", { summary: false, tool: "cram" }],
  ])("%s", (message, expected) => {
    expect(detectChatIntent(message)).toEqual(expected);
  });

  it("'Beni test et' çipi sohbette tek soru ister: araç değil", () => {
    expect(detectChatIntent("Bu konudan beni kısa bir soruyla test et.").tool).toBeNull();
  });
});

describe("cevabın altındaki gerçek stüdyo düğmeleri", () => {
  const nodes = new Map([
    [
      P1,
      [
        { id: "n-lesson-t1", kind: "lesson", sortOrder: 1, status: "done", sessionMeta: { topicId: "t1", topicTitle: "Mitoz Bölünme" } },
        { id: "n-quiz-t1", kind: "quiz", sortOrder: 2, status: "ready", sessionMeta: { topicId: "t1", topicTitle: "Mitoz Bölünme" } },
        { id: "n-lesson-t2", kind: "lesson", sortOrder: 3, status: "locked", sessionMeta: { topicId: "t2", topicTitle: "Mayoz ve Krossing Over" } },
        { id: "n-quiz-t2", kind: "quiz", sortOrder: 4, status: "locked", sessionMeta: { topicId: "t2", topicTitle: "Mayoz ve Krossing Over" } },
      ],
    ],
  ]);

  it("özet: Sınav Sabahı Kağıdı + konu dersi + konu testi, eşleşen konunun adımlarıyla", () => {
    const match = matchChatMaterial("mayoz bölünme konusundan özet çıkar", INDEX);
    const actions = buildChatActions({ intent: detectChatIntent("özet çıkar"), match, nodesByPrep: nodes });
    expect(actions.map((item) => item.label)).toEqual(["⚡ Sınav Sabahı Kağıdı'nı Aç", "📖 Konu Dersine Git", "🎯 Konu Testini Başlat"]);
    expect(actions.map((item) => item.href)).toEqual([
      `/deneme-sinavlari/${P1}/sinav-sabahi`,
      `/deneme-sinavlari/${P1}/dugum/n-lesson-t2`,
      `/deneme-sinavlari/${P1}/dugum/n-quiz-t2`,
    ]);
    expect(actions[0]!.context).toBe("Hücre Bölünmesi ve Kalıtım · Mayoz ve Krossing Over");
  });

  it("test isteği: konu testi düğmesi (sohbete soru dökülmez); deneme isteği: yazılı deneme kurulumu", () => {
    const match = matchChatMaterial("mitoz bölünmeden test hazırla", INDEX);
    expect(buildChatActions({ intent: detectChatIntent("test hazırla"), match, nodesByPrep: nodes }).map((a) => a.href)).toEqual([
      `/deneme-sinavlari/${P1}/dugum/n-quiz-t1`,
    ]);
    const written = buildChatActions({ intent: detectChatIntent("deneme sınavı yap"), match, nodesByPrep: nodes });
    expect(written).toEqual([expect.objectContaining({ label: "📝 Yazılı Denemeyi Başlat", href: `/deneme-sinavlari/${P1}/deneme/kurulum` })]);
  });

  it("birden çok ders eşleşince her ders için ayrı başlatıcı", () => {
    const match = matchChatMaterial("25 gün sonraki sınavlarım için deneme sınavı yap", INDEX);
    const actions = buildChatActions({ intent: detectChatIntent("deneme sınavı yap"), match, nodesByPrep: new Map() });
    expect(actions.map((item) => item.href).sort()).toEqual([`/deneme-sinavlari/${P1}/deneme/kurulum`, `/deneme-sinavlari/${P2}/deneme/kurulum`].sort());
  });

  it("hazırlık yoksa araç Çalışma Stüdyosu'nda açılır", () => {
    const actions = buildChatActions({
      intent: detectChatIntent("10 soruluk test hazırla"),
      match: { preps: [], documents: [], reason: "none", materialCue: false },
      nodesByPrep: new Map(),
    });
    expect(actions).toEqual([expect.objectContaining({ href: "/studio/quiz", context: "Çalışma Stüdyosu" })]);
  });

  it("işaret gidiş-dönüş; yalnız uygulama içi çalışma sayfası; modelin taklit işareti silinir", () => {
    const action = { kind: "quiz" as const, label: "🎯 Konu Testini Başlat", context: "A · B", href: `/deneme-sinavlari/${P1}/dugum/n1` };
    expect(splitActionMarkers(`Metin\n${actionMarker(action)}`)).toEqual({ body: "Metin\n", actions: [action] });
    expect(splitActionMarkers("[[arac:quiz|x|y|/admin/kullanicilar]]").actions).toEqual([]);
    expect(splitActionMarkers("[[arac:quiz|x|y|//kotu.example/a]]").actions).toEqual([]);
    expect(stripModelActionMarkers(`önce ${actionMarker(action)} sonra`)).toBe("önce  sonra");
  });
});

describe("tura özel satırlar", () => {
  const match = matchChatMaterial("mayoz notumdan özet", INDEX);

  it("kendi materyali: 'görünmüyor / yeniden yükle' yasak, hazırlığın adı satırda", () => {
    const [line] = materialTurnLines({
      match,
      intent: { summary: false, tool: null },
      hasEvidence: true,
      optionCount: 5,
      tone: { confused: false, wantsWhy: false },
      linkLine: true,
    });
    expect(line).toContain("Hücre Bölünmesi ve Kalıtım");
    expect(line).toMatch(/yeniden yükle.*ASLA|ASLA[\s\S]*yeniden yükle/);
  });

  it("özet: formül satırı, sınav ipucu, sık hata ve Akılda kalsın kutusu istenir", () => {
    const lines = materialTurnLines({ match, intent: { summary: true, tool: null }, hasEvidence: true, optionCount: 5, tone: { confused: false, wantsWhy: false }, linkLine: false });
    const summary = lines.find((line) => line.startsWith("ÖZET"))!;
    expect(summary).toContain("$$");
    expect(summary).toContain("📌 Sınav ipucu");
    expect(summary).toContain("⚠️ Sık hata");
    expect(summary).toContain("✅ Akılda kalsın");
  });

  it("araç: sohbete soru dökme ve '1-C, 2-A' yok; düğmeye yönlendir", () => {
    const lines = materialTurnLines({ match, intent: { summary: false, tool: "quiz" }, hasEvidence: false, optionCount: 5, tone: { confused: false, wantsWhy: false }, linkLine: false });
    expect(lines.join("\n")).toMatch(/soru listesi[\s\S]*YAZMA/);
    expect(lines.join("\n")).toContain("1-C, 2-A");
  });

  it("şık sayısı: lise / YKS / varsayılan 5 (A–E), ortaokul ve LGS 4", () => {
    expect(resolveOptionCount({ gradeLevel: "10. sınıf" })).toBe(5);
    expect(resolveOptionCount({ targetExam: "YKS" })).toBe(5);
    expect(resolveOptionCount({})).toBe(5);
    expect(resolveOptionCount({ targetExam: "LGS" })).toBe(4);
    expect(optionCountLine(5)).toContain("A, B, C, D, E");
    expect(optionCountLine(5)).toContain("dört şıklı soru yazma");
    expect(optionCountLine(4)).toContain("A, B, C, D");
  });

  it("usta hoca: kafa karışıklığında sıcak açılış; 'neden / ezberlemeden' sorusunda tek cümlelik benzetme", () => {
    const tone = readTeacherTone("Hocam kafam çok karıştı, bu neden böyle oluyor? Ezberlemeden nasıl aklımda tutacağım?");
    expect(tone).toEqual({ confused: true, wantsWhy: true });
    const lines = materialTurnLines({ match: null, intent: { summary: false, tool: null }, hasEvidence: false, optionCount: 5, tone, linkLine: false });
    expect(lines.some((line) => line.startsWith("USTA HOCA"))).toBe(true);
    expect(lines.find((line) => line.startsWith("BENZETME"))).toContain("💡 Benzetme");
    expect(readTeacherTone("2 + 2 kaç eder?")).toEqual({ confused: false, wantsWhy: false });
  });
});

/** Sahte servis istemcisi: tablo verisi üzerinde eq / in / is / neq / or / order / limit / maybeSingle. */
function fakeService(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => ((rows = rows.filter((row) => row[field] === value)), builder),
        neq: (field: string, value: unknown) => ((rows = rows.filter((row) => row[field] !== value)), builder),
        in: (field: string, values: unknown[]) => ((rows = rows.filter((row) => values.includes(row[field]))), builder),
        is: (field: string, value: unknown) => ((rows = rows.filter((row) => (row[field] ?? null) === value)), builder),
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as never;
}

describe("sunucu: hesabın hazırlık ve belgeleri prepId olmadan bulunur", () => {
  const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tables = {
    exam_preps: [
      { id: P1, user_id: USER, title: "Hücre Bölünmesi ve Kalıtım", exam_type: "yazili", exam_date: null, created_at: "2026-11-01", document_id: "doc-1" },
      { id: P2, user_id: "başkası", title: "Hücre Bölünmesi ve Kalıtım", exam_type: "yazili", exam_date: null, created_at: "2026-11-02", document_id: "doc-x" },
    ],
    exam_prep_topics: [{ id: "t2", exam_prep_id: P1, label: "Mayoz ve Krossing Over", sort_order: 1, document_topic_node_id: null }],
    documents: [
      { id: "doc-1", user_id: USER, file_name: "kalitim.pdf", deleted_at: null, part_of: null },
      { id: "doc-x", user_id: "başkası", file_name: "kalitim.pdf", deleted_at: null, part_of: null },
    ],
    exam_prep_nodes: [
      { id: "n-quiz", exam_prep_id: P1, kind: "quiz", status: "ready", sort_order: 1, session_meta: { topicId: "t2", topicTitle: "Mayoz ve Krossing Over" } },
    ],
  };

  it("adı geçen hazırlık yalnız öğrencinin kendisinin; belgesi aranır, test düğmesi yolun adımına gider", async () => {
    const link = await resolveChatMaterial(fakeService(tables), USER, "Yüklediğim mayoz notundan 5 soruluk test hazırla", null);
    expect(link).not.toBeNull();
    expect(link!.match.preps.map((item) => item.prep.id)).toEqual([P1]);
    expect(link!.documentIds).toEqual(["doc-1"]);
    expect(link!.actions).toEqual([expect.objectContaining({ kind: "quiz", href: `/deneme-sinavlari/${P1}/dugum/n-quiz` })]);
  });

  it("başka öğrencinin hazırlık kimliği seçili gelse de kullanılmaz", async () => {
    const link = await resolveChatMaterial(fakeService(tables), USER, "bunu anlat", P2);
    expect(link).toBeNull();
  });

  it("seçili hazırlık tek başına belge araması açmaz (materyalden söz yoksa)", async () => {
    const link = await resolveChatMaterial(fakeService(tables), USER, "bunu anlat", P1);
    expect(link?.match.reason).toBe("context");
    expect(link?.documentIds).toEqual([]);
    expect(link?.searchAll).toBe(false);
  });
});

describe("sohbet ucu ve istemci bağlantısı", () => {
  const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");

  it("Genel moddayken de eşleşen hazırlığın belgelerinde aranır; kanıt varsa cevap belgeye dayanır", () => {
    expect(route).toContain("searchDocumentChunksAcross(service, userId, message, material.documentIds");
    expect(route).toMatch(/const grounded = useDocuments \|\| documentAttached \|\| linkedEvidence;/);
    expect(route).toContain("contextPrepId: z.string().uuid().optional()");
  });

  it("düğmeyi yalnız sunucu basar: modelin işareti silinir, sunucunun işareti sonra eklenir", () => {
    expect(route.indexOf("content = stripModelActionMarkers(content);")).toBeGreaterThan(0);
    expect(route.indexOf("chatActions.map(actionMarker)")).toBeGreaterThan(route.indexOf("content = stripModelActionMarkers(content);"));
  });

  it("ana ekranda seçili hazırlık sohbete gider; hazırlık sohbetinde prepId geçerli", () => {
    const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");
    expect(panel).toContain("contextPrepId: prepId ? undefined : (contextPrepId ?? undefined)");
    expect(readFileSync("src/components/chat/tutor-reply-view.tsx", "utf8")).toContain("<StudioActionCards actions={split.actions} />");
  });
});
