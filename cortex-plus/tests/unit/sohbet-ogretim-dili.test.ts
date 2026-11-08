import { describe, expect, it } from "vitest";
import { calloutOf, quoteBlockText, renderMarkdownWith } from "@/lib/markdown-core";

/*
  8 Kasım 2026, ürün sahibi: "AI öğretmenle konuşurken balonlar çok sade; önemli yerler farklı renk ve yazı tipiyle,
  akılda kalıcı olmalı." Öğretmen dersteki işaretleri sohbette de kullanır; ekran onları tasarıma çevirir.
*/

const math = (tex: string, display: boolean) => `<k data-d="${display ? 1 : 0}">${tex}</k>`;
const html = (text: string) => renderMarkdownWith(text, math);

describe("kilit bilgi ==…==", () => {
  it("fosforlu kalem olur; eşitlik ve kod vurgu sayılmaz", () => {
    expect(html("Türevin ==sıfır olduğu== yer tepedir.")).toContain('<mark class="cp-key">sıfır olduğu</mark>');
    expect(html("a == b ise doğru.")).not.toContain("<mark");
    expect(html("x === y")).not.toContain("<mark");
    expect(html("==  boşluklu ==")).not.toContain("<mark");
  });
});

describe("öğretim kutuları", () => {
  it("etiket emoji ya da adla tanınır; tanınmayan alıntı sade alıntıdır", () => {
    expect(calloutOf("📌 Sınav ipucu: Türev sıfırsa tepe.")).toMatchObject({ kind: "exam", body: "Türev sıfırsa tepe." });
    expect(calloutOf("Sık hata: Tersini sanma.")?.kind).toBe("mistake");
    expect(calloutOf("💡 Benzetme: Hız göstergesi gibi.")?.kind).toBe("analogy");
    expect(calloutOf("🧠 Ezber kodu: KOD")?.kind).toBe("mnemonic");
    expect(calloutOf("✅ Akılda kalsın:")?.kind).toBe("remember");
    expect(calloutOf("🤔 Neden böyle? Çünkü …")?.kind).toBe("why");
    expect(calloutOf("Bir alıntı")).toBeNull();
    expect(quoteBlockText("> bir\n> iki")).toBe("bir\niki");
    expect(quoteBlockText("> bir\niki")).toBeNull();
  });

  it("paragrafın hemen altındaki kutu ayrı çizilir; kutunun içi de biçimlenir (liste, kilit bilgi)", () => {
    const out = html(
      "Türev anlık değişimdir.\n> 📌 Sınav ipucu: Türev ==sıfırsa== tepe ya da çukur.\n\n> ✅ Akılda kalsın:\n> - Bir: ==x==\n> - İki: ==y==",
    );
    expect(out).toContain("<p>Türev anlık değişimdir.</p>");
    expect(out).toContain('<aside class="cp-callout cp-callout--exam" data-callout="exam"><p class="cp-callout-label">Sınav ipucu</p>');
    expect(out).toContain('<mark class="cp-key">sıfırsa</mark>');
    expect(out).toMatch(/cp-callout--remember[\s\S]*<ul[\s\S]*<li>Bir: <mark class="cp-key">x<\/mark><\/li>/);
  });

  it("kutunun içindeki boş satır kutuyu bölmez", () => {
    const out = html("> ⚠️ Sık hata: Çoğu öğrenci tersini sanır.\n>\n> Doğrusu böyle.");
    expect(out.match(/cp-callout--mistake/g)).toHaveLength(1);
    expect(out).toContain("<p>Doğrusu böyle.</p>");
  });

  it("çıktı kaçışlı kalır: kutu içinden etiket enjekte edilemez", () => {
    const out = html("> 📌 Sınav ipucu: <img src=x onerror=alert(1)>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("tek başına $$…$$ satırı formül kartı", () => {
    expect(html("$$f'(x)=2x$$")).toContain('<div class="cp-md-formula"><k data-d="1">');
  });
});
