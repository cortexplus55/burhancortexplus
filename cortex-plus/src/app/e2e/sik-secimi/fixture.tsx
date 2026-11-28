"use client";

import { useState } from "react";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { optionMatchKey, stemMatchKey } from "@/lib/learning/option-match";
import { selectedOptions } from "@/lib/learning/exam-quiz";
import { fixtureAccount } from "../ana-ekran/fixture";

/** Sıra sıra: sunucunun kayıtlı sorusunun kökü, geri bildirimi ve şık → kilit metni (gerçek sunucu işlevlerinden). */
export type CheckTable = {
  stem: string;
  feedback: Record<string, unknown>;
  canonical: Record<string, string | string[] | null>;
}[];

/** Sunucuya giden "Kontrol et" istekleri; e2e testi okur. */
declare global {
  interface Window {
    __answerChecks?: Record<string, unknown>[];
    __fixtureKey?: string[];
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Sahte ağ: `answer-check` gerçek eylemin kurallarıyla (kök denetimi, şıkta olmayan cevabı reddetme, kilide şıkkın kendi
 * metni) tablodan cevaplar. Öbür eylemler (kayıt, bitirme) başarı döner.
 */
function installFetch(table: CheckTable) {
  if (typeof window === "undefined") return;
  const real = window.fetch.bind(window);
  window.__answerChecks = [];
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("/api/learning/exam-prep/node")) return real(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (body.action === "answer-check") {
      window.__answerChecks!.push(body);
      const asked = Number(body.questionIndex);
      const text = typeof body.questionText === "string" ? body.questionText : null;
      const index = text ? table.findIndex((row) => row.stem === stemMatchKey(text)) : asked;
      const row = table[index];
      if (!row) return json({ ok: false, error: "question_mismatch" }, 409);
      const items = selectedOptions(body.answer);
      const locked = items.length === 1 ? row.canonical[optionMatchKey(items[0])] : null;
      if (!locked) return json({ ok: false, error: "invalid_answer" }, 400);
      return json({ ok: true, index, answer: locked, question: row.feedback });
    }
    if (body.action === "complete") return json({ ok: true, score: 0, total: table.length });
    return json({ ok: true, contentVersion: 2, generationId: "fixture-gen" });
  };
}

export function SikSecimiFixture({ payload, table, keys }: { payload: Record<string, unknown>; table: CheckTable; keys: string[] }) {
  // Ağ, oturum ekranı ilk kez çizilmeden kurulur.
  useState(() => {
    installFetch(table);
    if (typeof window !== "undefined") window.__fixtureKey = keys;
    return true;
  });
  return (
    <ParitySorShell userInitial="Ö" streak={0} account={fixtureAccount(false)} chrome="session">
      <ExamNodeSession
        prepId="fixture-prep"
        nodeId="fixture-node"
        kind="quiz"
        prepTitle="9. sınıf Tarih"
        topicLabel="İlk çağ uygarlıkları"
        todayMood={null}
        initialFamiliarity="basics"
        resumeEnabled
        initialResume={{ ok: true, resumed: true, attemptId: "fixture-attempt", generationId: "fixture-gen", contentVersion: 1, payload }}
      />
    </ParitySorShell>
  );
}
