import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Kullanıcı başına yükleme alanı.
 *
 * Dosya boyutu tek tek sınırlıydı (15 MB) ama toplamı sınırsızdı: aynı hesap
 * beş yüz kez 15 MB yükleyip depolamayı şişirebiliyordu. Bu sınır kimsenin
 * ders çalışmasını engellemiyor — bir dönemlik ders notu birkaç yüz MB tutmaz —
 * ama sömürünün tavanını koyuyor.
 */
export const STORAGE_CAP_FREE = 150 * 1024 * 1024;
export const STORAGE_CAP_PREMIUM = 1024 * 1024 * 1024;

export type StorageUsage = {
  usedBytes: number;
  capBytes: number;
  remainingBytes: number;
};

export async function storageUsage(
  service: SupabaseClient,
  userId: string,
  isPremium: boolean,
): Promise<StorageUsage> {
  const { data } = await service
    .from("documents")
    .select("size_bytes")
    .eq("user_id", userId)
    .is("deleted_at", null);

  const usedBytes = (data ?? []).reduce(
    (sum, row) => sum + Number((row as { size_bytes: number | null }).size_bytes ?? 0),
    0,
  );
  const capBytes = isPremium ? STORAGE_CAP_PREMIUM : STORAGE_CAP_FREE;

  return {
    usedBytes,
    capBytes,
    remainingBytes: Math.max(0, capBytes - usedBytes),
  };
}

/** Bu dosya sığar mı. Sığmıyorsa yükleme hiç başlamasın. */
export function fitsInQuota(usage: StorageUsage, fileSize: number): boolean {
  return usage.usedBytes + fileSize <= usage.capBytes;
}
