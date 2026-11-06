#!/usr/bin/env node
/*
  "🔐 Kurucu Yönetim Girişi" için ADMIN_GATE_PIN_HASH üretir (6 Kasım 2026).

  Kullanım (önerilen; PIN kabuk geçmişine düşmez):
      node scripts/admin-pin-hash.mjs
      → PIN'i sorar, çıktıdaki tek satırı Vercel → Settings → Environment Variables →
        ADMIN_GATE_PIN_HASH (Production) olarak kaydet, sonra yeniden yayınla.

  Otomasyon için: ADMIN_PIN=... node scripts/admin-pin-hash.mjs   ya da   node scripts/admin-pin-hash.mjs <PIN>

  Biçim: scrypt$<N>$<r>$<p>$<tuz base64url>$<özet base64url>  (N=16384, r=8, p=1, 16 bayt tuz, 32 bayt özet).
  Doğrulayıcı: src/lib/auth/admin-gate-core.ts (`parsePinHash`, `verifyAdminPin`). PIN 6–64 karakter;
  baştaki/sondaki boşluk atılır, NFKC ile normalleşir. PIN düz metin hiçbir yerde saklanmaz.
*/
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384;
const r = 8;
const p = 1;

function hash(pin) {
  const salt = randomBytes(16);
  const key = scryptSync(pin.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function readPin() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.ADMIN_PIN) return process.env.ADMIN_PIN;
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  return new Promise((resolve) => rl.question("PIN (6–64 karakter): ", (answer) => { rl.close(); resolve(answer); }));
}

const pin = String(await readPin()).trim();
if (pin.length < 6 || pin.length > 64) {
  console.error("PIN 6–64 karakter olmalı.");
  process.exit(1);
}
process.stdout.write(`${hash(pin)}\n`);
