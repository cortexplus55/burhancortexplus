/** Hak sistemi (Faz 3A): istemci ve sunucuda güvenli parçalar. Sunucuya özel yardımcılar `server.ts`'te. */
export * from "@/lib/entitlements/types";
export * from "@/lib/entitlements/config";
export { getGate, gateFromRefusal, resolvePlan, snapshotFromAccount } from "@/lib/entitlements/gate";
export { track } from "@/lib/entitlements/track";
export type { EntitlementEvent, EntitlementEventPayload } from "@/lib/entitlements/track";
