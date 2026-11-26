import { NextResponse } from "next/server";
import { appVersionStatus, isVersion, storeUrl, versionPolicy, type AppStorePlatform } from "@/lib/platform/app-version";

/**
 * Mobil uygulamanın sürüm denetimi (26 Kasım 2026, mobil 1. adım). Oturum istemez, yalnız okur:
 * `?platform=ios|android&version=1.0` → durum, en düşük ve son sürüm, mağaza adresi. Kural `app-version.ts`te.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const platformParam = url.searchParams.get("platform");
  if (platformParam !== "ios" && platformParam !== "android") {
    return NextResponse.json({ error: "invalid_platform" }, { status: 400 });
  }
  const platform: AppStorePlatform = platformParam;
  const versionParam = url.searchParams.get("version");
  const version = isVersion(versionParam) ? versionParam.trim() : null;
  const policy = versionPolicy(platform);
  return NextResponse.json(
    {
      status: appVersionStatus(platform, version),
      minimum: policy.minimum,
      latest: policy.latest,
      storeUrl: storeUrl(platform),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
