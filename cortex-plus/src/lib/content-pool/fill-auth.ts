import "server-only";
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
