#!/usr/bin/env bash
#
# Göç dosyalarını GERÇEKTEN çalıştırıp davranışlarını ölçer.
#
# Neden var: birim testleri SQL metnini okuyor — bir dosyada doğru kelimelerin
# geçtiğini doğruluyor ama şemayı kurmuyor, fonksiyonu çağırmıyor. Haftalık
# paket tam bu boşluktan geçti: metin doğruydu, davranış yanlıştı. Haftalık
# abonenin kredi penceresi 30 gün kalıyordu ve yenileme dalı bir CHECK kısıtını
# ihlal ediyordu. İkisi de ancak zincir yerel bir Postgres'te koşunca görüldü.
#
# Kullanım:  scripts/verify-migrations.sh
# Gereken:   postgresql-16 + postgresql-16-pgvector
#
# Supabase'e ait şemalar (auth, storage) burada taklit ediliyor; amaç Supabase'i
# kopyalamak değil, göç dosyalarının kendi mantığını ölçmek.

set -euo pipefail

PORT="${PGPORT_TEST:-5433}"
DATA_DIR="${PGDATA_TEST:-/var/lib/postgresql/migcheck}"
DB="migcheck"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"

if [ -z "$PGBIN" ]; then
  echo "postgresql bulunamadı: apt-get install -y postgresql postgresql-16-pgvector" >&2
  exit 1
fi

as_pg() { su postgres -c "$1"; }

if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
  mkdir -p "$DATA_DIR"
  chown postgres:postgres "$DATA_DIR"
  as_pg "$PGBIN/initdb -D $DATA_DIR -A trust -E UTF8 --locale=C" >/dev/null
fi

if ! as_pg "$PGBIN/pg_ctl -D $DATA_DIR status" >/dev/null 2>&1; then
  as_pg "$PGBIN/pg_ctl -D $DATA_DIR -l $DATA_DIR/server.log -o '-p $PORT' -w start" >/dev/null
fi

cleanup() { as_pg "$PGBIN/pg_ctl -D $DATA_DIR -m fast stop" >/dev/null 2>&1 || true; }
trap cleanup EXIT

as_pg "psql -p $PORT -c 'DROP DATABASE IF EXISTS $DB;'" >/dev/null
as_pg "psql -p $PORT -c 'CREATE DATABASE $DB;'" >/dev/null

# Supabase taklidi: göç dosyalarının dayandığı asgari parçalar.
cat > /tmp/_supabase_stub.sql <<'STUB'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid $f$;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[], owner uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id), name text NOT NULL, owner uuid
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $f$ SELECT string_to_array(name, '/') $f$;
STUB
chmod a+r /tmp/_supabase_stub.sql
as_pg "psql -p $PORT -d $DB -q -v ON_ERROR_STOP=1 -f /tmp/_supabase_stub.sql" >/dev/null

echo "--- göç zinciri ---"
COUNT=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  # psql'in KENDİ çıkış kodu; çıktıda "error" aramak kırılgan — hata mesajı
  # Türkçe ya da farklı biçimde gelirse sessizce başarılı sayılırdı.
  if OUT=$(as_pg "psql -p $PORT -d $DB -q -v ON_ERROR_STOP=1 -f '$f'" 2>&1); then
    COUNT=$((COUNT + 1))
  else
    echo "HATA: $(basename "$f")" >&2
    echo "$OUT" | tail -12 >&2
    exit 1
  fi
done
echo "$COUNT göç dosyası uygulandı"

echo "--- davranış testleri ---"
as_pg "psql -p $PORT -d $DB -q -v ON_ERROR_STOP=1 -f '$ROOT/supabase/tests/migrations.test.sql'"
echo "hepsi geçti"
