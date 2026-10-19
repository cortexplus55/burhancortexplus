import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  19 Ekim 2026 (Faz 3.3): belge parça araması önce kullanıcının kendi parçalarına süzülür, sonra tam
  kosinüs mesafesiyle sıralanır. Canlı EXPLAIN ANALYZE: ~820 ms → 27 ms (8 sonuç, en çok belgesi olan
  kullanıcı). Eski sorgu bütün kullanıcıların ivfflat indeksine yaslanıp sonra süzüyordu; chunk_id
  indeksi yoktu. Göç eklemeli: aynı imza, aynı yetkiler, DROP yok.
*/
const sql = readFileSync("supabase/migrations/20261019120000_match_chunks_filter_first.sql", "utf8");
const body = sql.replace(/^--.*$/gm, "");

describe("match_document_chunks: önce süz, sonra tam mesafe", () => {
  it("kullanıcının parçalarını MATERIALIZED CTE'de süzer, mesafeye göre sıralar", () => {
    expect(body).toContain("WITH mine AS MATERIALIZED");
    expect(body).toContain("WHERE d.user_id = p_user_id");
    expect(body).toContain("ORDER BY m.distance");
  });

  it("birleştirme indeksi eklenir; imza ve yetkiler aynı; yıkıcı komut yok", () => {
    expect(body).toContain("CREATE INDEX IF NOT EXISTS document_embeddings_chunk_id_idx");
    expect(body).toContain("p_query_embedding vector(1536)");
    expect(body).toContain("TO service_role;");
    expect(body).toContain("FROM PUBLIC, anon, authenticated;");
    expect(body).not.toMatch(/\bDROP\b/);
  });
});
