import { describe, expect, it } from "vitest";
import {
  mapExtractFailure,
  userMessageForProcessError,
} from "@/lib/documents/process-user-message";

describe("process user messages", () => {
  it("maps encrypted PDF to Turkish copy", () => {
    expect(userMessageForProcessError("encrypted_pdf")).toMatch(/şifreli/i);
    expect(mapExtractFailure("PasswordException")).toMatch(/şifreli/i);
  });

  it("maps download failure", () => {
    expect(userMessageForProcessError("download_failed")).toMatch(/alın/i);
  });
});
