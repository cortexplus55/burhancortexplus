import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "@/lib/markdown";

describe("markdown sanitization", () => {
  it("escapes script tags instead of rendering them", () => {
    const html = renderMarkdownToHtml('<script>alert("xss")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("strips inline event handlers", () => {
    const html = renderMarkdownToHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("keeps allowed inline formatting", () => {
    const html = renderMarkdownToHtml("**kalın** ve `kod`");
    expect(html).toContain("<strong>kalın</strong>");
    expect(html).toContain("<code");
  });

  it("renders server citation links as same-origin anchors", () => {
    const html = renderMarkdownToHtml(
      "Cevap.\n\nKaynaklar:\n- [belge.pdf · s.3](/dokumanlar/abc?page=3#belge-onizleme)",
    );
    expect(html).toContain('<a href="/dokumanlar/abc?page=3#belge-onizleme"');
    expect(html).toContain("belge.pdf · s.3</a>");
    expect(html).toContain("<ul");
    expect(html).toContain("<p>Kaynaklar:</p>");
  });

  it("never links to external or scheme URLs", () => {
    for (const href of ["https://evil.example", "//evil.example/x", "javascript:alert(1)", "mailto:a@b.c"]) {
      const html = renderMarkdownToHtml(`[tıkla](${href})`);
      expect(html).not.toContain("<a ");
    }
  });

  it("renders ordered lists for numbered steps", () => {
    const html = renderMarkdownToHtml("1. ilk adım\n2. ikinci adım");
    expect(html).toContain("<ol");
    expect(html).toContain("<li>ilk adım</li>");
  });
});
