import { COOKIE_POLICY_VERSION } from "../../src/lib/legal/versions";

/*
  E2E'de çerez bandı (7 Kasım 2026, uyum paketi) her sayfanın altını kaplar ve tıklamalara biner. Bant testi
  (`uyum.spec.ts`) dışındaki testler tercihi verilmiş bir tarayıcıyla başlar: analitik kapalı, bugünkü politika.
*/
export const CONSENT_COOKIE = {
  name: "cp_consent",
  value: encodeURIComponent(
    JSON.stringify({ v: COOKIE_POLICY_VERSION, a: false, t: Date.now(), id: "00000000-0000-4000-8000-000000000e2e" }),
  ),
  domain: "127.0.0.1",
  path: "/",
  expires: Math.floor(Date.now() / 1000) + 30 * 86_400,
  httpOnly: false,
  secure: false,
  sameSite: "Lax" as const,
};
