// Hangi ders çizim isteyecek? Yalnızca OKUR — hiçbir şey üretmez, yazmaz.
// Çalıştırma: node --env-file=.env.local scripts/probe-diagram-trigger.mjs <prepId>
//
// Çizim yolu canlıda bir kez bile çalışmadı. Sebebini tahmin etmek yerine
// ölçüyoruz: konu adı ve kaynağın kendi alt başlıkları needsDiagram'a
// veriliyor, hangi düğümün çizim isteyeceği baştan görünüyor.
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const prepId = process.argv[2];
if (!prepId) throw new Error("usage: probe-diagram-trigger.mjs <prepId>");

const server = await createServer({
  configFile: "vitest.config.ts",
  server: { middlewareMode: true },
});
try {
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "dgjfyewgrukglsehyntc.supabase.co") {
    throw new Error("wrong_project");
  }
  const { needsDiagram } = await server.ssrLoadModule("/src/lib/learning/lesson-diagram.ts");
  const { sectionHeadings } = await server.ssrLoadModule("/src/lib/documents/topic-title.ts");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const { data: prep } = await db
    .from("exam_preps")
    .select("id,title,document_id")
    .eq("id", prepId)
    .single();
  if (!prep) throw new Error("prep_unavailable");
  console.log({ prep: prep.title, documentId: prep.document_id });

  const { data: nodes, error: nodeError } = await db
    .from("exam_prep_nodes")
    .select("id,kind,title,status,sort_order,session_meta")
    .eq("exam_prep_id", prepId)
    .order("sort_order", { ascending: true });
  if (nodeError) throw nodeError;
  console.log({ nodes: nodes?.length ?? 0 });

  console.log(
    (nodes ?? [])
      .map((n) => `${n.sort_order}\t${n.status}\t${n.kind}\t${n.session_meta?.topicTitle ?? "-"}`)
      .join("\n"),
  );

  for (const node of nodes ?? []) {
    if (node.kind !== "lesson") continue;
    const meta = node.session_meta ?? {};
    const pages = meta.sourcePages ?? [];
    let backbone = [];
    if (prep.document_id && pages.length) {
      const { data: docPages } = await db
        .from("document_pages")
        .select("page_number, headings")
        .eq("document_id", prep.document_id)
        .in("page_number", pages)
        .order("page_number", { ascending: true });
      backbone = sectionHeadings((docPages ?? []).map((p) => ({ headings: p.headings ?? [] })));
    }
    const label = meta.topicTitle ?? "(konu adı yok)";
    console.log({
      node: node.id,
      status: node.status,
      topic: label,
      pages,
      backbone,
      wantsDiagram: needsDiagram(label, ...backbone),
    });
  }
} finally {
  await server.close();
}
