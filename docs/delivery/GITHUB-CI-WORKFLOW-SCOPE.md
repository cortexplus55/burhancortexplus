# GitHub Actions CI — workflow scope

`.github/workflows/ci.yml` repoda hazır; **push** için `cortexplus55` GitHub token’ında **`workflow`** scope gerekir.

## Tek seferlik (cortexplus55 hesabı)

```bash
gh auth refresh -h github.com -s workflow
```

Cihaz kodu istenirse tarayıcıda onaylayın, ardından:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build, lint, typecheck, and test on cortex-plus changes"
git push origin main
```

Alternatif: GitHub web → **Add file** → workflow içeriğini yapıştır.
