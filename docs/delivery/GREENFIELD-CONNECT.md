# Cortex Plus bağlantıları

Tek kaynak [AGENTS.md](../../AGENTS.md), kurulum ayrıntıları [CLI-CONNECT.md](CLI-CONNECT.md).

| Bileşen | Hedef |
|---|---|
| GitHub | `cortexplus55/burhancortexplus` |
| Production dalı | `main` |
| Vercel takım / proje | `cortexplus55/burhancortexplus-app` |
| Vercel Root Directory | `cortex-plus` |
| Domain | `https://cortexplus.app` |
| Supabase | `dgjfyewgrukglsehyntc` |
| Operasyon e-postası | `cortexplus@cortexplus.app` |

5 Eylül 2026 kontrolünde canlı istemci doğru Supabase ref'ini kullanıyordu. Vercel'de `cortexplus.app`, doğru reponun `main` dalındaki `45f3e57` commit'ine bağlıydı. Bu tarihli gözlemdir; yeni yayında güncel commit tekrar doğrulanmalıdır.

Chrome oturumları ile CLI/Codex bağlayıcı oturumlarını birbirine karıştırmayın. Vercel bağlayıcısında eski hesap, Supabase bağlayıcısında yetki sorunu görüldü. Supabase panelinde GitHub/Vercel entegrasyonu bağlı görünmüyordu; bu, uygulamanın Supabase'e bağlanamadığı anlamına gelmez.

Yeni proje oluşturmayın. Eski veya yedek projeleri hedef almayın. Mevcut projelere erişimi düzeltin. Migration geçmişi hizalanana kadar otomatik şema dağıtımını etkinleştirmeyin ve `supabase db push` çalıştırmayın.
