import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveUploadMime } from "@/lib/documents/store-upload";

describe("photo upload mime", () => {
  it("accepts HEIC from the file name when the browser sends an empty type", () => {
    expect(resolveUploadMime({ type: "", name: "not.HEIC" }, Buffer.alloc(0))).toBe("image/heic");
  });

  it("sniffs an HEIC file header", () => {
    const head = Buffer.alloc(16);
    head.write("ftyp", 4, "ascii");
    head.write("heic", 8, "ascii");
    expect(resolveUploadMime({ type: "", name: "kamera" }, head)).toBe("image/heic");
  });

  it("keeps jpeg and png", () => {
    expect(resolveUploadMime({ type: "image/jpeg", name: "a.jpg" }, Buffer.alloc(0))).toBe(
      "image/jpeg",
    );
    expect(resolveUploadMime({ type: "image/png", name: "a.png" }, Buffer.alloc(0))).toBe(
      "image/png",
    );
  });
});

describe("add-source does not reset progress", () => {
  const source = readFileSync("src/app/api/learning/exam-prep/add-source/route.ts", "utf8");

  it("analyzes only the new document and does not rewrite readiness or statuses", () => {
    expect(source.match(/runTeacherAnalysis\(/g)).toHaveLength(1);
    expect(source).toContain("planAddedMaterial");
    expect(source).not.toContain("readiness_score:");
    expect(source).not.toContain("status: \"done\"");
    expect(source).not.toContain(".delete(");
  });
});
