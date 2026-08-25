import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

function allMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
    .join("\n");
}

const sql = allMigrationSql();

const USER_SCOPED_TABLES = [
  "profiles",
  "credit_wallets",
  "credit_ledger",
  "conversations",
  "messages",
  "documents",
  "document_chunks",
  "document_embeddings",
  "quizzes",
  "quiz_questions",
  "flashcard_sets",
  "flashcards",
  "practice_exams",
  "practice_exam_attempts",
  "study_plans",
  "study_plan_tasks",
  "notifications",
  "payments",
  "support_requests",
];

describe("row level security coverage", () => {
  it.each(USER_SCOPED_TABLES)("enables RLS on %s", (table) => {
    expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  });

  it("scopes document embeddings to the owning user", () => {
    expect(sql).toMatch(/CREATE POLICY doc_embeddings_own[\s\S]*auth\.uid\(\)/);
  });

  it("restricts audit log reads to admins", () => {
    expect(sql).toMatch(/CREATE POLICY audit_admin_only[\s\S]*is_admin/);
  });

  it("only returns vector matches for the requesting user", () => {
    expect(sql).toMatch(/match_document_chunks[\s\S]*WHERE d\.user_id = p_user_id/);
  });
});

describe("credit ledger integrity", () => {
  it("locks the wallet row before spending", () => {
    expect(sql).toMatch(
      /credit_reserve[\s\S]*FROM public\.credit_wallets WHERE user_id = p_user_id FOR UPDATE/,
    );
  });

  it("rejects spending beyond the available balance", () => {
    expect(sql).toMatch(/credit_reserve[\s\S]*RAISE EXCEPTION 'insufficient_credits'/);
  });

  it("makes reservations idempotent per key", () => {
    expect(sql).toContain("UNIQUE (user_id, idempotency_key)");
  });

  it("prevents a duplicate purchase from granting credits twice", () => {
    expect(sql).toContain("credit_ledger_purchase_key");
  });

  it("returns the existing reservation when the same key is replayed", () => {
    expect(sql).toMatch(/credit_reserve[\s\S]*IF v_existing IS NOT NULL THEN RETURN v_existing/);
  });

  it("refunds by returning the reserved amount to the balance", () => {
    expect(sql).toMatch(/credit_refund[\s\S]*balance = balance \+ r\.amount/);
  });
});

describe("storage isolation", () => {
  it("scopes the documents bucket to the owner folder", () => {
    expect(sql).toMatch(
      /documents_storage_select[\s\S]*auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/,
    );
  });

  it("keeps the documents bucket private", () => {
    expect(sql).toMatch(/storage\.buckets[\s\S]*'documents',\s*\n?\s*false/);
  });
});
