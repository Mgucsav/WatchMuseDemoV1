#!/usr/bin/env bash
#
# WatchMuse — gerçek PostgreSQL entegrasyon testi koşucusu.
#
# Kullanım:
#   export WATCHMUSE_TEST_DATABASE_URL="postgresql://...atılabilir test db..."
#   bash supabase/tests/run-integration-tests.sh
#
# Bu script yalnızca ATILABİLİR bir test veritabanında çalıştırılmalıdır:
# şema düşürür ve veri yazar.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_DIR="$ROOT/supabase/tests/sql"

if [[ -z "${WATCHMUSE_TEST_DATABASE_URL:-}" ]]; then
  echo "NOT RUN: WATCHMUSE_TEST_DATABASE_URL tanımlı değil." >&2
  echo "         Kurulum için supabase/tests/README.md dosyasına bakın." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "NOT RUN: 'psql' bulunamadı. PostgreSQL istemcisi gerekiyor." >&2
  echo "         Kurulum için supabase/tests/README.md dosyasına bakın." >&2
  exit 2
fi

# --- Production koruması ------------------------------------------------------
# Testler şema düşürür. Yönetilen bir Supabase adresine bağlanmayı reddederiz.
if [[ "$WATCHMUSE_TEST_DATABASE_URL" == *"supabase.co"* ]]; then
  echo "REDDEDİLDİ: adres bir yönetilen Supabase projesine benziyor." >&2
  echo "            Bu testler yalnızca atılabilir yerel bir veritabanında çalışır." >&2
  exit 1
fi

echo "WatchMuse entegrasyon testleri"
echo "  hedef  : (adres güvenlik gereği yazdırılmıyor)"
echo "  sql dir: $SQL_DIR"
echo

failed=0
for file in "$SQL_DIR"/*.sql; do
  name="$(basename "$file")"
  printf "  %-34s " "$name"

  if psql "$WATCHMUSE_TEST_DATABASE_URL" \
       --quiet --no-psqlrc \
       --variable=ON_ERROR_STOP=1 \
       --variable=MIGRATIONS_DIR="$ROOT/supabase/migrations" \
       --file "$file" >/tmp/wm-itest.log 2>&1; then
    echo "PASS"
  else
    echo "FAIL"
    sed 's/^/      /' /tmp/wm-itest.log >&2
    failed=1
  fi
done

echo
if [[ "$failed" -ne 0 ]]; then
  echo "SONUÇ: BAŞARISIZ" >&2
  exit 1
fi

echo "SONUÇ: tüm entegrasyon testleri geçti"
