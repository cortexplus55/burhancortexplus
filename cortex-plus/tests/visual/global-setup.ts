import { execFileSync } from "node:child_process";
import path from "node:path";

/*
  Her koşudan önce taze giriş (Faz 0, 2.6). Supabase yenileme jetonunu her kullanımda değiştirir: bir saatten eski bir
  giriş durumu dosyasıyla paralel açılan sekmeler aynı eski jetonla oturumu tazelemeye çalışır, ikinci kullanım
  "zaten kullanıldı" sayılır ve oturum kapanır (14 Kasım 2026'da ilk taban bu yüzden giriş ekranını çekti).
  Sunucu (`webServer`) bu adımdan önce kalkar. Parolalar yalnız yerel dosyadan (`tests/.auth/e2e-users.local.json`).
*/
export default async function globalSetup() {
  if (process.env.CI || process.env.VISUAL_SKIP_LOGIN === "1") return; // CI'da görsel taban yok (00-taban.md)
  execFileSync(process.execPath, [path.join("scripts", "e2e-login.mjs")], {
    stdio: "inherit",
    env: { ...process.env, E2E_BASE_URL: "http://127.0.0.1:3006" },
  });
}
