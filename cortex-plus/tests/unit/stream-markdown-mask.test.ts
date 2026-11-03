import { describe, expect, it } from "vitest";
import { maskStreamingMarkdown } from "@/lib/chat/stream-markdown-mask";

describe("akış markdown maskesi", () => {
  it("kapanmamış kalın işaret gizlenir", () => {
    expect(maskStreamingMarkdown("**Kurultay, dev")).toBe("Kurultay, dev");
    expect(maskStreamingMarkdown("Önce **a** sonra **b")).toBe("Önce **a** sonra b");
    expect(maskStreamingMarkdown("__alt")).toBe("alt");
    expect(maskStreamingMarkdown("bir *eğik")).toBe("bir eğik");
  });
  it("tamamlanan metin aynen kalır", () => {
    expect(maskStreamingMarkdown("**Kurultay, devlet**")).toBe("**Kurultay, devlet**");
    expect(maskStreamingMarkdown("* madde\n* madde")).toBe("* madde\n* madde");
    expect(maskStreamingMarkdown("```\n**x")).toBe("```\n**x");
  });
});
