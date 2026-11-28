import { config } from "zod";

/**
 * Tarayıcıda zod'un "kod üretimi" (JIT) kapalı (28 Kasım 2026).
 *
 * Zod v4 nesne şeması kurulurken tarayıcının kod üretmeye izin verip vermediğini `Function("")` ile yokluyor.
 * Üretimde CSP `unsafe-eval` içermediği için bu yoklama her sayfa açılışında bir ihlal raporu (`/api/csp-report`,
 * bir sunucu çağrısı) üretiyordu; hata yakalanıp yutulsa da tarayıcı raporu gönderiyor. `jitless` açıkken zod
 * yoklamayı hiç yapmaz ve doğrulamayı yorumlayarak sürdürür (sonuç aynı). Ayar `globalThis` üzerinde tutulduğu
 * için her paket parçası aynı değeri görür; şemalar kurulmadan önce, istemcinin ilk dosyasında
 * (`instrumentation-client.ts`) verilir. Sunucu etkilenmez.
 */
export function applyZodBrowserConfig(): void {
  config({ jitless: true });
}
