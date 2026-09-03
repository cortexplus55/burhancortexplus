import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { withUser, errorResponse } from "@/lib/api/guards";
import { appOrigin } from "@/lib/app-url";
import { qrDataUri } from "@/lib/qr";

const TTL_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "phone-session", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { error } = await service.from("phone_upload_sessions").insert({
    user_id: userId,
    token,
    expires_at: expiresAt,
  });

  if (error) return errorResponse(500, "generation_failed");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    request.headers.get("origin")?.replace(/\/$/, "") ||
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : appOrigin());
  const uploadUrl = `${origin}/yukle/${token}`;

  // QR sunucuda üretilir; token hiçbir dış servise gitmez.
  const qr = await qrDataUri(uploadUrl, 168);

  return NextResponse.json({ token, expiresAt, uploadUrl, qr });
}
