import {
  ADMIN_GATE_MAX_FAILURES,
  verifyAdminPin,
  type AdminGateConfig,
} from "@/lib/auth/admin-gate-core";

/*
  Bir PIN denemesinin kararı (6 Kasım 2026). Sayaç yalnız YANLIŞ denemeyi sayar: doğru PIN'i giren
  kurucunun hakkı yenmez. 10 dakikada 5 yanlıştan sonra doğru PIN de kabul edilmez (kilit süresi dolana dek).
  Saf: sayaç ve denetim kaydı çağıranın; test edilebilsin diye next/headers'a dokunmaz.
*/

export type GateAttemptOutcome =
  | { kind: "off" }
  | { kind: "misconfigured" }
  | { kind: "locked" }
  | { kind: "wrong"; remaining: number }
  | { kind: "passed" };

export async function decideAdminGateAttempt(input: {
  pin: string;
  config: AdminGateConfig;
  failures: { count: () => Promise<number>; record: () => Promise<number> };
}): Promise<GateAttemptOutcome> {
  if (input.config.state === "off") return { kind: "off" };
  if (input.config.state === "misconfigured") return { kind: "misconfigured" };
  if ((await input.failures.count()) >= ADMIN_GATE_MAX_FAILURES) return { kind: "locked" };
  if (verifyAdminPin(input.pin, input.config.pin)) return { kind: "passed" };
  const used = await input.failures.record();
  const remaining = Math.max(0, ADMIN_GATE_MAX_FAILURES - used);
  return remaining === 0 ? { kind: "locked" } : { kind: "wrong", remaining };
}

export function gateAttemptMessage(outcome: GateAttemptOutcome): string | null {
  switch (outcome.kind) {
    case "passed":
    case "off":
      return null;
    case "misconfigured":
      return "PIN ayarı okunamadı. Vercel'de ADMIN_GATE_PIN_HASH'i `node scripts/admin-pin-hash.mjs` ile yeniden üret; APP_SECRET de tanımlı olmalı.";
    case "locked":
      return "Çok fazla yanlış deneme. 10 dakika sonra yeniden dene.";
    case "wrong":
      return `PIN yanlış. ${outcome.remaining} deneme hakkın kaldı.`;
  }
}
