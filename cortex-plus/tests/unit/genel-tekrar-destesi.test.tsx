// @vitest-environment jsdom
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { cardKey, nextGeneralStep } from "@/lib/learning/general-review";
import { clozeFromFact, rememberItemsValid, splitRememberBlock } from "@/lib/learning/remember-facts";
import { RememberCard } from "@/components/chat/remember-card";
import { ReviewDeckSession } from "@/components/learning/review-deck-session";
import { renderMarkdownWith } from "@/lib/markdown-core";
import { CHAT_TEACHING_MARKUP } from "@/lib/ai/teacher-tutor";

/*
  8 Kasım 2026, ürün sahibinin kararları: sohbet cevabının sonundaki "Akılda kalsın" maddeleri "Tekrarıma ekle" ile
  genel tekrar destesine girer (hazırlıktan bağımsız) ve 1, 3, 7, 14 gün sonra boşluk doldurma kartı olarak geri gelir.
  Kart öğretmenin cümlesinden kodla kurulur; model çağrısı yok.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

describe("Akılda kalsın kutusu cevaptan ayrılır", () => {
  const answer =
    "Mitoz büyüme içindir.\n\n> 📌 Sınav ipucu: Hücre sayısına bak.\n\n> ✅ Akılda kalsın:\n> - Mayoz sonucunda ==dört haploit hücre== oluşur.\n> - Mitozda kromozom sayısı ==korunur==.";

  it("maddeler alınır, kutu metinden çıkar, öbür kutu kalır", () => {
    const split = splitRememberBlock(answer);
    expect(split.items).toEqual(["Mayoz sonucunda ==dört haploit hücre== oluşur.", "Mitozda kromozom sayısı ==korunur==."]);
    expect(split.body).not.toContain("Akılda kalsın");
    expect(split.body).toContain("Sınav ipucu");
    expect(splitRememberBlock("Düz cevap.")).toEqual({ body: "Düz cevap.", items: [] });
  });

  it("kilit bilgi boşluk olur; bütün cümle işaretliyse ya da işaret yoksa kart kurulmaz", () => {
    expect(clozeFromFact("Mayoz sonucunda ==dört haploit hücre== oluşur.")).toEqual({
      front: "Mayoz sonucunda _____ oluşur.",
      back: "dört haploit hücre",
    });
    expect(clozeFromFact("==Mayozda kromozom sayısı yarıya iner.==")).toBeNull();
    expect(clozeFromFact("İşaretsiz bir cümle.")).toBeNull();
    // İkinci işaret düz metne döner, cevap ilk işaret.
    expect(clozeFromFact("Mitozda ==2==, mayozda ==4== hücre.")).toEqual({ front: "Mitozda _____, mayozda 4 hücre.", back: "2" });
    expect(rememberItemsValid(["a"])).toBe(false);
    expect(rememberItemsValid(["Mayoz ==4== hücre verir."])).toBe(true);
  });

  it("aynı kart aynı anahtar (büyük küçük harf ve boşluk fark etmez)", () => {
    expect(cardKey({ front: "Mayoz  _____ verir.", back: "4" })).toBe(cardKey({ front: "mayoz _____ verir.", back: "4" }));
  });
});

describe("1-3-7-14 merdiveni", () => {
  it("bildim bir basamak ilerletir, 14. günde bilinen öğrenildi; bilemedim 1. güne döner", () => {
    expect(nextGeneralStep(0, true, "2026-11-08")).toEqual({ step: 1, dueOn: "2026-11-11" });
    expect(nextGeneralStep(1, true, "2026-11-08")).toEqual({ step: 2, dueOn: "2026-11-15" });
    expect(nextGeneralStep(2, true, "2026-11-08")).toEqual({ step: 3, dueOn: "2026-11-22" });
    expect(nextGeneralStep(3, true, "2026-11-08")).toBeNull();
    expect(nextGeneralStep(2, false, "2026-11-08")).toEqual({ step: 0, dueOn: "2026-11-09" });
  });
});

describe("göç (PGlite)", () => {
  const db = new PGlite();
  const user = "00000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await db.exec(`CREATE TABLE public.profiles(id uuid PRIMARY KEY); INSERT INTO public.profiles VALUES ('${user}');`);
    await db.exec(read("supabase/migrations/20261108120000_genel_tekrar_destesi.sql"));
  });
  afterAll(async () => {
    await db.close();
  });

  it("aynı kart ikinci kez eklenmez; basamak 0..3; satır güvenliği açık", async () => {
    const insert = `INSERT INTO general_review_cards (user_id, front, back, card_key, due_on) VALUES ($1, 'Mayoz _____ verir.', '4 hücre', 'abcdef0123456789', '2026-11-09') ON CONFLICT (user_id, card_key) DO NOTHING RETURNING id`;
    expect((await db.query(insert, [user])).rows).toHaveLength(1);
    expect((await db.query(insert, [user])).rows).toHaveLength(0);
    await expect(db.query("UPDATE general_review_cards SET interval_step = 4")).rejects.toThrow();
    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'general_review_cards'");
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    await db.query("DELETE FROM profiles WHERE id = $1", [user]);
    expect((await db.query("SELECT count(*)::int AS n FROM general_review_cards")).rows[0]).toEqual({ n: 0 });
  });
});

describe("ekranlar", () => {
  it("Akılda kalsın kartı: maddeler ve 'Tekrarıma ekle'; ekleyince deste bağlantısı", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ added: 2 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<RememberCard items={["Mayoz ==4== hücre verir.", "Mitozda sayı ==korunur==."]} />);
    fireEvent.click(screen.getByRole("button", { name: /Tekrarıma ekle/ }));
    expect(await screen.findByText(/2 kart destene eklendi/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Destemi aç" }).getAttribute("href")).toBe("/tekrar");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ facts: ["Mayoz ==4== hücre verir.", "Mitozda sayı ==korunur==."] });
    vi.unstubAllGlobals();
  });

  it("kart kurulamayan maddelerde düğme yok", () => {
    render(<RememberCard items={["İşaretsiz madde cümlesi."]} />);
    expect(screen.queryByRole("button", { name: /Tekrarıma ekle/ })).toBeNull();
  });

  it("tekrar oturumu: boşluklu soru → cevabı göster → bildim; tur sonunda özet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ReviewDeckSession
        cards={[{ id: "00000000-0000-4000-8000-000000000009", front: "Mayoz _____ verir.", back: "4 hücre", interval_step: 0, due_on: "2026-11-09", ask_count: 0 }]}
        dueCount={1}
        total={3}
      />,
    );
    expect(screen.getByText("Mayoz _____ verir.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cevabı göster" }));
    expect(screen.getByText("4 hücre")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bildim" }));
    expect(await screen.findByRole("heading", { name: "Bu tur bitti" })).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: "00000000-0000-4000-8000-000000000009", knew: true });
    vi.unstubAllGlobals();
  });

  it("boş deste nasıl dolacağını anlatır", () => {
    render(<ReviewDeckSession cards={[]} dueCount={0} total={0} />);
    expect(screen.getByText(/Tekrarıma ekle/)).toBeTruthy();
  });
});

describe("kaynak sözleşmeleri", () => {
  it("öğretim dili iki sohbete de gider; JSON hazırlık yolunda yok", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain("${rest.prepId && prepGrounding ? \"\" : `\\n\\n${CHAT_TEACHING_MARKUP}\\n\\n`}");
    expect(read("src/lib/ai/teacher-tutor.ts")).toMatch(/CONTENT_STYLE,\n\s*CHAT_TEACHING_MARKUP,/);
    expect(CHAT_TEACHING_MARKUP).toContain("> ✅ Akılda kalsın:");
    expect(CHAT_TEACHING_MARKUP).toContain("asla bütün cümle değil");
  });

  it("ardışık numaralı bloklar tek liste (adım çizgisi bütün adımlarda)", () => {
    const html = renderMarkdownWith("1. Bir.\n\n2. İki.\n\n3. Üç.", (tex) => tex);
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html).not.toContain('start="2"');
    // Türkçe sıra sayısı ("2. ay") yine olduğu gibi.
    expect(renderMarkdownWith("2. ay aşı\n\n6. ay aşı", (tex) => tex)).not.toMatch(/<ol(?![^>]*start)/);
  });

  it("alıntı eşleştirme ve seslendirme işaretleri yok sayar; hesap silinince deste gider", () => {
    expect(read("src/lib/ai/document-answer-verification.ts")).toContain('.replace(/==/g, "")');
    expect(read("src/components/chat/chat-panel.tsx")).toMatch(/plainForSpeech[\s\S]*?\.replace\(\/==\/g, ""\)/);
    expect(read("src/lib/privacy/account-deletion.ts")).toContain('"general_review_cards"');
  });
});

describe("Soru Çöz aynı dilde (8 Kasım 2026)", () => {
  it("tuzak 'Sık hata' kutusu, gösterilmeyen kural 'Akılda kalsın' kartı; sohbete kayıt da aynı biçimde", () => {
    const view = read("src/components/learning/question-solver.tsx");
    expect(view).toContain('<aside className="cp-callout cp-callout--mistake cp-solver-callout" data-callout="mistake">');
    expect(view).toContain("{!locked && solution.tip ? <RememberCard items={[solution.tip]} /> : null}");
    expect(view).not.toContain("cp-solver-trap");
    const saved = read("src/lib/solve/solution-markdown.ts");
    expect(saved).toContain("`> ⚠️ Sık hata: ${solution.trap}`");
    expect(saved).toContain('"> ✅ Akılda kalsın:", `> - ${solution.tip}`');
    // Ölçüm: çözücüye kilit bilgi işareti istemek kuralı bozuyordu (4 sorudan 3'ünde); istem değişmedi.
    expect(read("src/lib/solve/question-solver.ts")).toContain('"- trap: öğrencinin en çok karıştırdığı nokta (bir cümle). tip: akılda kalacak kısa kural. "');
  });
});

describe("yol adımları ve hazırlık kartı (8 Kasım 2026)", () => {
  it("kilitli adım türünü gösterir (soluk simge + köşede kilit); renk türden", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain('<Lock className="cp-puck-lock" aria-hidden />');
    expect(home).toContain('data-kind={level ? "level" : node.kind}');
    const shell = read("src/styles/parity-shell.css");
    expect(shell).toContain('.cp-exam-trail-node[data-kind="podcast"] { --node-accent: #ff7aa3; }');
    expect(shell).toMatch(/\.cp-path-next--focus \.cp-path-next-actions \{\n\s*display: grid;/);
  });

  it("hazırlık kartında sınav tarihi varsa kalan süre çipi", () => {
    expect(read("src/components/parity/exam-prep.tsx")).toContain("{card.dated && card.daysLabel ? (");
    expect(read("src/lib/learning/prep-cards.ts")).toContain("dated: Boolean(prep.exam_date),");
  });
});

describe("hazırlık kartı gün tekrarı", () => {
  it("tarihli kartta gün yalnız çipte, alt şeritte yok", () => {
    expect(read("src/components/parity/exam-prep.tsx")).toMatch(/\{card\.dated && card\.daysLabel \? null : \(\n\s*<>\n\s*\{card\.daysLabel\}/);
  });
});
