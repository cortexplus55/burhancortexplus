import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { isAdminUser } from "@/lib/auth/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/** Yalnız yönetici (user_roles → public.is_admin). Değilse null. */
export async function adminUserId(): Promise<string | null> {
  const { data } = await (await createClient()).auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;
  return (await isAdminUser(createServiceClient(), userId).catch(() => false)) ? userId : null;
}

/**
 * Zamanlanmış devam tetiği (GitHub Actions): `x-pool-resume-token` başlığının sha256'sı bayrak metadata'sındaki
 * resume_token_sha256 ile eşleşmeli. Düz anahtar sunucuda tutulmaz; tetik yalnız yöneticinin açtığı, tavanlı işi sürdürür.
 */
export function resumeTokenAuthorized(request: Request, expectedSha256: unknown): boolean {
  const token = request.headers.get("x-pool-resume-token");
  if (!token || typeof expectedSha256 !== "string" || expectedSha256.length !== 64) return false;
  const got = createHash("sha256").update(token).digest();
  const want = Buffer.from(expectedSha256, "hex");
  return want.length === got.length && timingSafeEqual(got, want);
}
