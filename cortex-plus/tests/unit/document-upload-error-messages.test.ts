import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { errorResponse } from "@/lib/api/guards";

/**
 * Live report: a student uploads a document and sees a raw, untranslated
 * error code ("invalid_file" / "upload_failed") instead of a Turkish
 * message — /api/documents/upload/route.ts returned these two codes via a
 * bare NextResponse.json({ error: code }) instead of the shared
 * errorResponse() translator every other error code in this route already
 * goes through. To a non-technical user this reads as "the upload is
 * broken", not as an explainable failure.
 */
describe("document upload error messages are translated, not raw codes", () => {
  it("errorResponse translates invalid_file and upload_failed to Turkish", async () => {
    const invalidFile = await (errorResponse(400, "invalid_file") as Response).json();
    expect(invalidFile.error).not.toBe("invalid_file");
    expect(invalidFile.error.length).toBeGreaterThan(10);
    expect(invalidFile.code).toBe("invalid_file");

    const uploadFailed = await (errorResponse(400, "upload_failed") as Response).json();
    expect(uploadFailed.error).not.toBe("upload_failed");
    expect(uploadFailed.error.length).toBeGreaterThan(10);
    expect(uploadFailed.code).toBe("upload_failed");
  });

  it("the upload route no longer returns these codes raw via a bare NextResponse.json", () => {
    const source = readFileSync("src/app/api/documents/upload/route.ts", "utf8");
    expect(source).not.toMatch(/NextResponse\.json\(\s*\{\s*error:\s*"invalid_file"/);
    expect(source).not.toMatch(/NextResponse\.json\(\s*\{\s*error:\s*stored\.error/);
    expect(source).toContain('errorResponse(400, "invalid_file")');
    expect(source).toContain("errorResponse(400, stored.error)");
  });
});

describe("documents Storage bucket accepts HEIC/HEIF (matches app-level validation)", () => {
  it("has a migration adding image/heic and image/heif to the bucket's allowed_mime_types", () => {
    // The original bucket migration (20250825120100_storage.sql) never
    // included HEIC/HEIF even though the app has accepted and advertised
    // them since — Supabase Storage enforces its own allowed_mime_types at
    // the Storage API layer regardless of app-level checks, so an iPhone
    // photo (HEIC by default) passed every app check and then failed at
    // the actual storage write. Look for a migration that adds them.
    const files = readdirSync("supabase/migrations");
    const heicMigration = files.find((f) => {
      if (!f.endsWith(".sql")) return false;
      const contents = readFileSync(`supabase/migrations/${f}`, "utf8");
      return (
        contents.includes("storage.buckets") &&
        contents.includes("'documents'") &&
        contents.includes("image/heic") &&
        contents.includes("image/heif")
      );
    });
    expect(heicMigration).toBeDefined();
  });
});
