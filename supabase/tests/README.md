# WatchMuse — Gerçek Veritabanı Entegrasyon Testleri

Bu klasör **gerçek PostgreSQL/Supabase** üzerinde çalışan entegrasyon testlerini
içerir.

> **Bunlar statik SQL metin testleri DEĞİLDİR.**
> `src/lib/rooms/reusable-round-migration.test.ts` dosyası SQL *metnini* regex
> ile kontrol eder ve entegrasyon testi sayılmaz. Kısıt semantiği, transaction
> davranışı, kilit yarışları, RLS ve grant'ler yalnızca buradaki testlerle
> kanıtlanabilir.

---

## Mevcut durum

| | |
| --- | --- |
| Harness | Depoda mevcut |
| Son çalıştırma | **ÇALIŞTIRILMADI** |
| Sebep | Bu geliştirme makinesinde `docker`, `psql`, `supabase` CLI ve yerel PostgreSQL **kurulu değil** |

Kurulum yapılmadı: sistem yazılımı kurmak açık kullanıcı onayı gerektirir.

---

## Ön koşullar

Aşağıdakilerden **biri** yeterlidir:

**A. Supabase CLI (önerilir)**
```bash
supabase start          # yerel Postgres + Auth ayağa kalkar
```

**B. Docker ile tek Postgres**
```bash
docker run --name watchmuse-test -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 -d postgres:15
```

**C. Var olan bir test veritabanı** — yalnızca **atılabilir** bir veritabanı.

---

## ⚠️ Güvenlik

- **Production veritabanına ASLA bağlanmayın.** Testler şema düşürür ve veri yazar.
- Bağlantı adresi `WATCHMUSE_TEST_DATABASE_URL` ile verilir; koda gömülmez.
- Runner, adres `supabase.co` içeriyorsa **çalışmayı reddeder** (production koruması).
- Bu klasördeki hiçbir dosyada gerçek kimlik bilgisi yoktur.

---

## Çalıştırma

```bash
# 1) Test veritabanı adresini ver (production DEĞİL)
export WATCHMUSE_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/postgres"

# 2) Tüm entegrasyon paketini çalıştır
bash supabase/tests/run-integration-tests.sh
```

Windows PowerShell:

```powershell
$env:WATCHMUSE_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:55432/postgres"
powershell -File supabase/tests/run-integration-tests.ps1
```

Tek dosya çalıştırmak için:

```bash
psql "$WATCHMUSE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sql/03_round_lifecycle.sql
```

Başarı ölçütü: **çıkış kodu 0** ve hiçbir `ASSERTION FAILED` satırı olmaması.
Her assertion başarısızlıkta `raise exception` ile durur.

---

## Dosya sırası

Runner dosyaları **alfabetik** çalıştırır ve sıra anlamlıdır:

| Dosya | Rolü |
| --- | --- |
| `00_migration_chain.sql` | `public` şemasını düşürür, rolleri/`auth` şemasını kurar, yedi migration'ı uygular |
| `01_helpers.sql` | `wm_test` assertion ve fixture yardımcıları (şema düşmelerinden etkilenmez) |
| `02_upgrade_from_legacy.sql` | Legacy şema + veri → yükseltme; sonunda zinciri yeniden kurar |
| `03_round_lifecycle.sql` | Tur yaşam döngüsü, append-only geçmiş, kısıt savunmaları |
| `04_acceptance.sql` | Kabul, kütüphane etkisi, süre sınırı, ilişkisel bütünlük |
| `05_eligibility_boundaries.sql` | RR-01 uygunluk sınırları ve hard suppression |
| `06_input_validation.sql` | Bozuk girdi → tanımlı domain hatası |
| `07_authorization_privacy.sql` | Grant'ler, aktör doğrulaması, gizlilik |
| `08_subscription_intersection.sql` | Abonelik beyanı, ortak platform kesişimi, tekrar için alt küme kuralı |

---

## Kapsam

| # | Senaryo | Dosya |
| --- | --- | --- |
| 1 | Boş veritabanında tam migration zinciri | `00_migration_chain.sql` |
| 2 | `ccce84b` benzeri production şemasından yükseltme | `02_upgrade_from_legacy.sql` |
| 3 | Legacy active / result / no_match backfill | `02_upgrade_from_legacy.sql` |
| 4 | İki eşzamanlı tur başlatma | `03_round_lifecycle.sql` — ⚠️ elle, iki oturum |
| 5 | İki eşzamanlı çark | `03_round_lifecycle.sql` — ⚠️ elle, iki oturum |
| 6 | Aynı kullanıcının tekrarlı kabulü | `04_acceptance.sql` |
| 7 | İki kullanıcının ardışık kabulü | `04_acceptance.sql` |
| 8 | Mevcut `watched` kütüphane kaydının korunması | `04_acceptance.sql` |
| 9 | Tam 7 / 14 / 30 gün sınırları | `05_eligibility_boundaries.sql` |
| 10 | İki veya daha eski turda görülmüş film | `05_eligibility_boundaries.sql` |
| 11 | Tam 10 benzersiz aday + en az 1 gerçek keşif | `05_eligibility_boundaries.sql` |
| 12 | Bozuk aday JSON'u | `06_input_validation.sql` |
| 13 | Üye A / üye B / yabancı yetkilendirmesi | `07_authorization_privacy.sql` |
| 14 | `authenticated` ile doğrudan güvenilen RPC çağrısı **başarısız olmalı** | `07_authorization_privacy.sql` |
| 15 | Partner verisinin sızmaması | `07_authorization_privacy.sql` |
| 16 | `SECURITY DEFINER` + `search_path` davranışı | `07_authorization_privacy.sql` |
| 17 | Ortak abonelik kümesi turla saklanır; boş/bozuk küme reddedilir | `08_subscription_intersection.sql` |
| 18 | Daralan ortak kümede eski turun filmi tekrar edilemez | `08_subscription_intersection.sql` |
| 19 | Katılımcı yalnızca kendi abonelik beyanını güncelleyebilir | `08_subscription_intersection.sql` |

### ⚠️ Gerçek eşzamanlılık hakkında

4 ve 5 numaralı senaryolar **iki ayrı veritabanı bağlantısı** gerektirir; tek
oturumlu `psql` koşucusu bunları çalıştıramaz. `03_round_lifecycle.sql` dosyası
tek oturumda kanıtlanabilen **kısıt seviyesindeki** savunmaları test eder
(partial unique index, composite FK, idempotency) ve dosya sonunda iki oturumlu
prosedürü adım adım belgeler. Bu adımlar elle çalıştırılmadıkça eşzamanlılık
davranışı **doğrulanmış sayılmaz**.

---

## `npm test` ile ilişkisi

`src/lib/rooms/db-integration-harness.test.ts` dosyası harness'ın **var
olduğunu** ve tam olduğunu doğrular; harness'ı **çalıştırmaz**. Kapsanan on dokuz
senaryo orada `todo` olarak listelenir, böylece `npm test` çıktısı bunların
çalıştırılmadığını dürüstçe gösterir.

---

## Bu testler geçene kadar

Aşağıdaki iddialar **doğrulanmamış** sayılmalıdır:

- RLS politikalarının gerçekten uygulandığı
- `start_next_space_round` üzerindeki service-role sınırının etkili olduğu
- Eşzamanlı tur/çark/kabul yarışlarının doğru çözüldüğü
- Kısıtların (composite FK, partial unique index) beklendiği gibi davrandığı
- Migration'ın production benzeri veriyle sorunsuz yükseltildiği
