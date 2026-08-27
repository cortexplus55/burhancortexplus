# Cortex Plus — operasyon kimliği

## Tek adres (operasyon)

| Kullanım | Adres |
|----------|--------|
| Google Cloud / OAuth consent, Squarespace, Workspace admin, agent oturumları, test kullanıcıları | **`cortexplus@cortexplus.app`** |

Kişisel e-posta (**ör. `@gmail.com`**) Cortex Plus altyapı ve otomasyon için **kullanılmaz**.

## Uygulama / gönderim

| Kullanım | Adres |
|----------|--------|
| Gönderen (`EMAIL_FROM`) | `Cortex Plus <cortexplus@cortexplus.app>` (Workspace SMTP — bkz. [WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md)) |
| Kamuya açık iletişim (site) | `cortexplus@cortexplus.app` |

## Agent kuralı

Cursor: `.cursor/rules/cortexplus-identity.mdc` ve kök `AGENTS.md`.

## Geçmiş temizlik

- OAuth dokümanları ve test notları kişisel Gmail yerine `cortexplus@cortexplus.app` kullanır.
- Gmail MCP yeniden bağlanacaksa yalnızca Workspace hesabı ile bağlan.
