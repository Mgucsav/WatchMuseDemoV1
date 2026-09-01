# WatchMuse — Reusable Room Remediation Report

**Tarih:** 2026-08-25
**Dal:** `feature/reusable-room-candidates`
**Checkpoint:** `1de436d wip: preserve reusable room implementation before remediation`
**Kapsam:** Yalnızca Phase A (RR-01, RR-02, RR-03, D, E, F, G, H)

---

## 1. Executive summary

Phase A'nın **kod ve şema tarafı tamamlandı**. Denetimde bulunan üç kritik
kusurun üçü de kaynağında düzeltildi:

| Kusur | Durum |
| --- | --- |
| RR-01 — keşif/tekrar sınırı yalnızca bir önceki turu dışlıyordu; `selection_reason` seçim sonrası çıkarımla üretiliyordu | **Düzeltildi** |
| RR-02 — aday planını kalıcılaştıran RPC `authenticated` rolüne açıktı | **Düzeltildi** |
| RR-03 — eski RPC kalıcı bir authenticated aday-üretim kapısı olarak duruyordu | **Düzeltildi** |
| D — regex+cast boolean ifadeleri, eksik ilişkisel bütünlük | **Düzeltildi** |
| E — terminal istemci bayat kalıyordu, geçici hata ekranı düşürüyordu | **Düzeltildi** |
| F — nanoid GHSA-2v37-7h3g-55p8 | **Düzeltildi** (0 vulnerabilities) |
| G — gerçek veritabanı entegrasyon harness'ı | **Yazıldı, ÇALIŞTIRILMADI** |
| H — dokümantasyon | **Güncellendi** |

**Ancak:** SQL kısıtlarının, grant'lerin, RLS'in, transaction semantiğinin ve
eşzamanlılık yarışlarının doğru davrandığı **gerçek bir veritabanında
kanıtlanmadı**. Bu makinede `docker`, `psql`, `supabase` CLI ve yerel PostgreSQL
kurulu değil; sistem yazılımı kurmak açık onay gerektirdiği için kurulum
yapılmadı. Harness depoda hazır ama **çalıştırılmadı**.

Migration **uygulanmadı**. Commit, push, deploy, dal değişikliği yapılmadı.
`.env.local` hiçbir aşamada okunmadı.

---

## 2. RR-01 — Gerçek keşif / uygun tekrar sınırı

### Kusurun kökü

Eski kodda `fresh_discovery` geçişi yalnızca **bir önceki turu** dışlıyordu
(`previous.round_id = v_previous_round_id`). `selection_reason` ise seçimden
**sonra**, space geçmişine bakılarak çıkarılıyordu. Sonuç: iki tur önce
gösterilmiş bir film "fresh" olarak havuza giriyor, ardından yanlış etiketleniyordu.

### Yapılan

`start_next_space_round` yeniden yazıldı
([20260813000100_reusable_rounds.sql:252](supabase/migrations/20260813000100_reusable_rounds.sql#L252)).

**Tam geçmiş dışlaması.** `seen_before` CTE'si space'in bütün geçmişini kapsar —
`round_id` filtresi yok:

```sql
), seen_before as (
  select distinct prior_candidate.tmdb_movie_id as movie_id
  from public.space_rounds prior_round
  join public.room_candidates prior_candidate
    on prior_candidate.round_id = prior_round.id
  where prior_round.space_id = p_space_id
)
```
([:466](supabase/migrations/20260813000100_reusable_rounds.sql#L466))

**Reason'ı seçen geçiş yazar.** `'selectionReason', v_pass`
([:507](supabase/migrations/20260813000100_reusable_rounds.sql#L507)) — çıkarım
kodu tamamen kaldırıldı. Doğrulandı: dosyada `v_previous_round_id` ve
`historical_candidate` **0 kez** geçiyor.

**Kapı yalnızca talep edildiğinde açılır.**

```sql
v_passes := case
  when p_allow_eligible_repeats then array['fresh_discovery', 'eligible_repeat']
  else array['fresh_discovery']
end;
```

**Hard suppression hiçbir geçişte açılmaz.** Üç geçiş de tek bir doğruluk
kaynağını çağırır: `public.is_movie_hard_suppressed(uuid, integer)`
([:177](supabase/migrations/20260813000100_reusable_rounds.sql#L177)). Kural
`priority_return` ([:407](supabase/migrations/20260813000100_reusable_rounds.sql#L407))
ve diğer iki geçiş ([:491](supabase/migrations/20260813000100_reusable_rounds.sql#L491))
için aynıdır; ayrışamaz. `p_allow_eligible_repeats` bu çağrıların hiçbirini
atlamaz.

**Slot değişmezleri.**

```sql
if jsonb_array_length(v_final) <> 10
   or cardinality(v_seen_ids) <> 10
   or v_fresh_count < 1
   or v_reserved_slots > 9 then
  raise exception 'candidate_pool_incomplete' using errcode = '22023';
end if;
```
([:527](supabase/migrations/20260813000100_reusable_rounds.sql#L527))

`v_reserved_slots` yalnızca `priority_return` ve `eligible_repeat` için artar;
`v_fresh_count` yalnızca gerçek keşif için. Sağlanamazsa transaction hiçbir tur
ya da aday yazmadan durur — havuz uygun olmayan filmle **doldurulmaz**.

**Uygulama tarafı.** `decideEligibility` yeniden adlandırıldı ve genişletildi
([eligibility.ts:72-79](src/lib/rooms/eligibility.ts#L72-L79)):
`shownInPreviousRound` → `shownInSpaceHistory`, `avoidImmediateRepeat` →
`requiresEligibleRepeatGate`, yeni `isTrueDiscovery`.

### Testler

`src/lib/rooms/eligibility.test.ts` — `decideEligibility — RR-01 tam geçmiş
sınırı` bloğu, istenen senaryo dahil: **"İKİ VEYA DAHA ESKİ turda görülmüş film
gerçek keşif SAYILMAZ"**.

`src/lib/rooms/candidate-pipeline.test.ts` — `eligible repeat yalnızca son
bounded denemede açılır`, `son denemede bile havuz kurulamazsa DÜRÜSTÇE
başarısız olur`, `policy ve ranker sürümü sunucu sabitlerinden gelir`.

SQL tarafı: `supabase/tests/sql/05_eligibility_boundaries.sql` — **çalıştırılmadı**.

---

## 3. RR-02 — Güvenilen aday-planı sınırı

### Veritabanı tarafı

```sql
revoke all on function
  public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)
  from public, anon, authenticated;

grant execute on function
  public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)
  to service_role;
```
([:987](supabase/migrations/20260813000100_reusable_rounds.sql#L987),
[:1002](supabase/migrations/20260813000100_reusable_rounds.sql#L1002))

`is_movie_hard_suppressed` de istemci rollerine kapalıdır
([:990](supabase/migrations/20260813000100_reusable_rounds.sql#L990)) — bastırma
nedenleri sızmasın diye.

**Aktör kimliği açıkça geçilir ve SQL'de bağımsız doğrulanır:**

```sql
if p_actor_id is null then
  raise exception 'unauthenticated' using errcode = '28000';
end if;
...
if not exists (
  select 1 from public.participants p
  where p.space_id = p_space_id and p.user_id = p_actor_id
) then
  raise exception 'invalid_invitation' using errcode = 'P0001';
end if;
```
([:281](supabase/migrations/20260813000100_reusable_rounds.sql#L281),
[:296](supabase/migrations/20260813000100_reusable_rounds.sql#L296))

Uygulama katmanı atlansa bile üyeliği olmayan bir aktör için tur açılamaz.

### Uygulama tarafı

Yeni `src/lib/supabase/admin.ts`:

- ilk satırı `import "server-only"` — istemci paketine alınırsa **derleme kırılır**,
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca **export edilmeyen** `readServiceRoleKey()`
  içinde okunur,
- `persistSession: false, autoRefreshToken: false, detectSessionInUrl: false`,
- yapılandırma hatası `SupabaseAdminNotConfiguredError` ile bildirilir; mesaj
  yalnızca **değişken adını** içerir, değeri asla,
- hiçbir `console.*` çağrısı yok.

Çağrı sırası ([round-service.ts:103-115](src/lib/rooms/round-service.ts#L103-L115)):

```text
1. requireSpaceMember(spaceId)      ← kullanıcı oturumu (RLS) · aktör UUID'si kanıtlanır
2. sourceAndPersistRoundCandidates  ← sunucu boru hattı: seed, sayfa sırası, ranker, policy
3. createSupabaseAdminClient()      ← service_role · YALNIZCA 1. adım geçtiyse
4. rpc(..., { p_actor_id: actorId })
```

Yönetimsel istemci, üyelik kanıtlanmadan **oluşturulmaz bile**.
`SupabaseAdminNotConfiguredError` yakalanır ve `not_configured` hatasına
dönüştürülür ([:109](src/lib/rooms/round-service.ts#L109)); sessizce daha zayıf
bir yola düşülmez.

Aday, seed, policy sürümü, ranker sürümü ve `allowEligibleRepeats` **yalnızca**
`src/lib/rooms/candidate-pipeline.ts` içinden gelir; istek gövdesinden okunmaz.
`selection_reason` uygulama katmanında **hiç üretilmez**.

### Testler

`src/lib/supabase/admin.test.ts` (10 test):
`server-only` ilk satırda · `NEXT_PUBLIC_*SERVICE_ROLE` yok · `console` yok ·
`persistSession: false` · kontrollü hata · mesaj değeri içermiyor · ve
`requireSpaceMember`'ın `createSupabaseAdminClient`'tan **önce** çağrıldığını
kanıtlayan statik sıra testi.

**Depoda gerçek anahtar yok.** `.env.example` yalnızca adı belgeler.
`.env.local` bu çalışmanın hiçbir aşamasında okunmadı.

---

## 4. RR-03 — Eski RPC ve devreye alma

`create_or_reset_space_round` kalıcı bir authenticated aday-üretim kapısı olarak
**bırakılmadı**:

```sql
begin
  perform p_space_id, p_candidates, p_reset;
  raise exception 'round_creation_moved' using errcode = 'P0001';
end;
```
([:594](supabase/migrations/20260813000100_reusable_rounds.sql#L594))

`authenticated` rolünden EXECUTE geri alındı
([:989](supabase/migrations/20260813000100_reusable_rounds.sql#L989)). Wrapper
aday planı **kabul etmez ve kaydetmez**; eski istemciler sessizce yanlış
davranmak yerine anlaşılır bir domain hatası alır. `round_creation_moved`
`RoomErrorCode`, `MESSAGES` ve `DATABASE_ERROR_CODES` sözlüklerine eklendi
(`src/lib/rooms/errors.ts`).

**Sonuç açıkça belgelendi:** migration önce uygulandığında, yeni sürüm deploy
edilene kadar **yeni tur açma kapalıdır**. Bakım penceresi sırası
`ROOM_SELECTION_AND_WHEEL_SETUP.md` §2 ve `docs/ROOMS_ARCHITECTURE.md` §13b
içinde tablo halinde verildi:

1. `SUPABASE_SERVICE_ROLE_KEY` sunucu ortamına eklenir
2. Bakım penceresi duyurulur
3. Migration uygulanır → **yeni tur açma kapalı**
4. Yeni uygulama sürümü deploy edilir → açık
5. Doğrulama (grant sorguları + bir gerçek tur)
6. Pencere kapatılır

Pencere boyunca devam eden turlarda oylama, çark ve kabul **çalışmaya devam
eder**; yalnızca yeni tur açma kapalıdır.

---

## 5. D — Girdi doğrulama ve ilişkisel bütünlük

### Cast güvenliği

Doğrulama sorgusu **yalnızca regex** kullanır; boolean ifadenin içinde hiçbir
cast yoktur. Bozuk sayısal alan kontrolsüz bir cast exception'ı değil, tanımlı
`invalid_candidates` domain hatası üretir. Cast'ler yalnızca regex'in doğrulandığı
`CASE` dalının içinde yapılır:

```sql
case when candidate.value ->> 'tmdbMovieId' ~ '^[1-9][0-9]{0,8}$'
  then (candidate.value ->> 'tmdbMovieId')::integer
end as movie_id
```

Aynı desen `releaseYear` ve `voteAverage` için de uygulandı.

### Şema seviyesi bütünlük

| Kısıt | Garanti |
| --- | --- |
| `space_rounds_winner_belongs_to_round` | `winner_candidate_id` **kendi turunun** adayı olmak zorunda (deferrable initially deferred) |
| `room_selections_round_space_fk` | Seçimin `space_id` değeri turun `space_id` değeriyle eşleşmek zorunda |
| `room_selections_candidate_chain_fk` | `(candidate_id, round_id, tmdb_movie_id)` zinciri tek parça hareket eder |

Destekleyici benzersizlikler: `space_rounds (id, space_id)`,
`room_candidates (id, round_id)`, `room_candidates (id, round_id, tmdb_movie_id)`.

**Cascade ve append-only.** Kısıtların `on delete cascade` yönü tur → aday →
seçim şeklindedir; yani bir tur silinmedikçe altındakiler de silinmez. Normal
yaşam döngüsünde tur **hiç silinmez** — eski `DELETE FROM space_rounds` gövdesi
tamamen kaldırıldı. Bu kod incelemesiyle doğrulandı; cascade davranışının
çalışan bir veritabanında kanıtlanması `supabase/tests/sql/04_acceptance.sql`
içindedir ve **çalıştırılmadı**.

---

## 6. E — Polling ve bayat istemci

`src/lib/rooms/polling-policy.ts`:

- `TERMINAL_POLL_INTERVAL_MS = 30_000` — `pollingIntervalFor` terminal durumda
  artık `null` yerine 30 saniye döndürür. Sonuç ekranında kalan istemci,
  partneri yeni tur açtığında bunu **tam sayfa yenilemeden** görür. 1200 ms
  **geri getirilmedi**.
- `MAX_TRANSIENT_POLL_FAILURES = 3` + `classifyPollFailure()` — ağ/5xx kaynaklı
  geçici hata ekranı hemen kalıcı hata durumuna düşürmez; sınır aşılınca düşer.
  Yetki/oturum hataları geçici sayılmaz ve hemen yüzeye çıkar.
- `isSelectionExpired()` — bekleyen seçim yedi günlük pencere dolduğunda görsel
  olarak süresiz açık kalmaz.

`src/components/rooms/RoomRound.tsx`:

- `actionError` state'i eklendi; `startNextRound` ve `acceptSelection`
  başarısızlığı artık **RoomRound durumunu atmaz** — mevcut ekran korunur, hata
  satır içi gösterilir. Kullanıcı oylarını veya bekleyen seçimi kaybetmez.
- `transientPollError` + `pollFailuresRef` ile sınırlı yeniden deneme.
- `selectionNow` tick'i 30 saniyede bir çalışır ve **yalnızca bekleyen seçim
  varken**; `setState` yalnızca timer callback'i içinde (React `set-state-in-effect`
  kuralı temiz).
- Her state geçişinde timer temizlenir ve in-flight fetch abort edilir.

Testler: `src/lib/rooms/polling-policy.test.ts` (11 test) — terminal yenileme,
`classifyPollFailure`, `isSelectionExpired`.

---

## 7. F — nanoid GHSA-2v37-7h3g-55p8

```
$ npm ls nanoid
movie-search-demo@0.1.0
+-- @tailwindcss/postcss@4.3.3
| `-- postcss@8.5.26
|   `-- nanoid@3.3.18
`-- next@16.3.0
  `-- postcss@8.5.23
    `-- nanoid@3.3.18 deduped

$ npm audit --omit=dev
found 0 vulnerabilities
```

`npm audit fix` **çalıştırılmadı**. Geniş bağımlılık yükseltmesi yapılmadı,
framework major sürümü değişmedi.

En küçük uyumlu değişiklik: `postcss@8.5.26` zaten `nanoid ^3.3.17` istiyordu,
yani `3.3.18` semver uyumlu. `package.json` içine tek satırlık bir override
eklendi:

```json
"overrides": { "nanoid": "^3.3.18" }
```

Lockfile farkı **tek sürüm değişikliği** içeriyor: `3.3.17` → `3.3.18`
(`package-lock.json` 6 satır).

---

## 8. G — Gerçek veritabanı entegrasyon harness'ı

### ⚠️ Durum: ÇALIŞTIRILMADI

`docker`, `psql`, `supabase` CLI ve yerel PostgreSQL bu makinede **kurulu
değil**. Sistem yazılımı kurmak açık onay gerektirdiği için kurulum yapılmadı ve
production Supabase'e **bağlanılmadı**. Harness depoda hazır ama çalıştırılmadı;
hiçbir senaryo "geçti" olarak raporlanmıyor.

### Yazılanlar

```
supabase/tests/
├── README.md                        durum, ön koşullar, tam komutlar, kapsam
├── run-integration-tests.sh         bash koşucu
├── run-integration-tests.ps1        PowerShell koşucu
└── sql/
    ├── 00_migration_chain.sql       şema sıfırlama · roller · auth · 6 migration
    ├── 01_helpers.sql               wm_test assert / act_as / fixture
    ├── 02_upgrade_from_legacy.sql   legacy şema + veri → yükseltme → backfill
    ├── 03_round_lifecycle.sql       yaşam döngüsü · append-only · kısıtlar
    ├── 04_acceptance.sql            kabul · kütüphane · süre · bütünlük
    ├── 05_eligibility_boundaries.sql RR-01 sınırları · 29/31 gün · suppression
    ├── 06_input_validation.sql      bozuk girdi → tanımlı domain hatası
    └── 07_authorization_privacy.sql grant · aktör · gizlilik · SECURITY DEFINER
```

**Production koruması:** her iki koşucu da `WATCHMUSE_TEST_DATABASE_URL` gerektirir
ve adres `supabase.co` içeriyorsa çalışmayı **reddeder**. Hiçbir harness
dosyasında gerçek kimlik bilgisi yoktur (test ile doğrulanıyor).

### 16 senaryonun durumu

| # | Senaryo | Dosya | Durum |
| --- | --- | --- | --- |
| 1 | Boş DB'de tam migration zinciri | `00_migration_chain.sql` | NOT RUN |
| 2 | Production benzeri legacy şemadan yükseltme | `02_upgrade_from_legacy.sql` | NOT RUN |
| 3 | Legacy active/result/no_match backfill | `02_upgrade_from_legacy.sql` | NOT RUN |
| 4 | İki eşzamanlı tur başlatma | `03_round_lifecycle.sql` | NOT RUN · **iki oturum gerekir** |
| 5 | İki eşzamanlı çark | `03_round_lifecycle.sql` | NOT RUN · **iki oturum gerekir** |
| 6 | Aynı kullanıcının tekrarlı kabulü | `04_acceptance.sql` | NOT RUN |
| 7 | İki kullanıcının ardışık kabulü | `04_acceptance.sql` | NOT RUN |
| 8 | Mevcut `watched` kaydının korunması | `04_acceptance.sql` | NOT RUN |
| 9 | Tam 7/14/30 gün sınırları | `05_eligibility_boundaries.sql` | NOT RUN |
| 10 | İki veya daha eski turda görülmüş film | `05_eligibility_boundaries.sql` | NOT RUN |
| 11 | Tam 10 benzersiz + ≥1 gerçek keşif | `05_eligibility_boundaries.sql` | NOT RUN |
| 12 | Bozuk aday JSON'u | `06_input_validation.sql` | NOT RUN |
| 13 | Üye A / üye B / yabancı | `07_authorization_privacy.sql` | NOT RUN |
| 14 | `authenticated` doğrudan RPC → başarısız | `07_authorization_privacy.sql` | NOT RUN |
| 15 | Partner verisinin sızmaması | `07_authorization_privacy.sql` | NOT RUN |
| 16 | `SECURITY DEFINER` + `search_path` | `07_authorization_privacy.sql` | NOT RUN |

**4 ve 5 hakkında dürüst not:** gerçek paralel yarış **iki ayrı veritabanı
bağlantısı** gerektirir; tek oturumlu `psql` koşucusu bunları çalıştıramaz.
`03_round_lifecycle.sql` tek oturumda kanıtlanabilen **kısıt seviyesindeki**
savunmaları test eder (partial unique index, composite FK, idempotency) ve dosya
sonunda iki oturumlu prosedürü adım adım belgeler. Bu adımlar elle
çalıştırılmadıkça eşzamanlılık davranışı doğrulanmış sayılmaz.

### Statik testlerin yanlış sunulmaması

`src/lib/rooms/reusable-round-migration.test.ts` SQL **metnini** regex ile okur.
Bu bir entegrasyon testi **değildir** ve raporda, `supabase/tests/README.md`
içinde ve dosya başlığında açıkça öyle işaretlenmiştir.

`src/lib/rooms/db-integration-harness.test.ts` harness'ın var olduğunu ve tam
olduğunu doğrular (14 gerçek assertion) ve 16 senaryoyu `todo` olarak listeler —
böylece `npm test` çıktısı bunların **çalıştırılmadığını** dürüstçe gösterir.

---

## 9. H — Dokümantasyon

| Dosya | Değişiklik |
| --- | --- |
| `docs/ROOMS_ARCHITECTURE.md` | Güven sınırı diyagramına `admin.ts` eklendi; "service_role hiçbir yerde kullanılmaz" ifadesi **düzeltildi**; §12 tam geçmiş dışlaması + slot değişmezleri; §13 policy/reason sahipliği; **yeni §13a** güvenilen kalıcılık sınırı; **yeni §13b** eski RPC ve bakım penceresi; §15 terminal 30 sn yenileme, sınırlı yeniden deneme, seçim süresi, aksiyon hatası; §16 ilişkisel bütünlük tablosu + doğrulama sınırı; §17'ye 8 yeni madde |
| `ROOM_SELECTION_AND_WHEEL_SETUP.md` | "yeni gizli değer gerekmiyor" ifadesi **düzeltildi**; yeni §1 service role kurulumu; bakım penceresi tablosu; grant doğrulama sorguları; `selection_reason` doğrulama sorgusu; manuel teste 3 yeni adım; **yeni §5** harness durumu (ÇALIŞTIRILMADI); rollback notu yeniden yazıldı; deploy değişken listesi 4 → 5 |
| `.env.example` | "SUPABASE_SERVICE_ROLE_KEY bu projede KULLANILMAZ" uyarısı **düzeltildi**; değişken **adı** ve kullanım kuralları belgelendi. Gerçek değer yok |
| `supabase/tests/README.md` | Dosya sırası tablosu; eşzamanlılık uyarısı; `npm test` ilişkisi |

Planlanan davranış hiçbir yerde doğrulanmış gibi yazılmadı; entegrasyon testi
durumu her üç dokümanda da **ÇALIŞTIRILMADI** olarak geçiyor.

---

## 10. Doğrulama sonuçları

```
$ npm test
 Test Files  21 passed (21)
      Tests  247 passed | 16 todo (263)

$ npm run typecheck
> tsc --noEmit
(çıktı yok — temiz)

$ npm run lint
> eslint
(çıktı yok — temiz)

$ npm run build
✓ Generating static pages using 15 workers (12/12) in 659ms
(20 route derlendi; hata yok)

$ npm audit --omit=dev
found 0 vulnerabilities
```

16 `todo`, çalıştırılmamış veritabanı senaryolarıdır — kasıtlı ve görünür.

---

## 11. Değişen dosyalar

```
 .env.example                                       |  30 +-
 ROOM_SELECTION_AND_WHEEL_SETUP.md                  | 178 +++++++-
 docs/ROOMS_ARCHITECTURE.md                         | 192 +++++++-
 package-lock.json                                  |   6 +-
 package.json                                       |   3 +
 src/components/rooms/RoomRound.tsx                 | 104 ++++-
 src/lib/rooms/candidate-pipeline.test.ts           |  48 ++
 src/lib/rooms/candidate-pipeline.ts                |  17 +
 src/lib/rooms/eligibility.test.ts                  |  60 ++-
 src/lib/rooms/eligibility.ts                       |  22 +-
 src/lib/rooms/errors.ts                            |   4 +
 src/lib/rooms/polling-policy.test.ts               |  55 ++-
 src/lib/rooms/polling-policy.ts                    |  38 +-
 src/lib/rooms/reusable-round-migration.test.ts     | 103 ++++-
 src/lib/rooms/round-service.ts                     |  60 ++-
 supabase/migrations/20260813000100_reusable_rounds.sql | 505 +++++++++-------
 16 files changed, 1140 insertions(+), 285 deletions(-)
```

Yeni dosyalar: `src/lib/supabase/admin.ts`, `src/lib/supabase/admin.test.ts`,
`src/lib/rooms/db-integration-harness.test.ts`, `supabase/tests/` (11 dosya),
bu rapor.

---

## 12. Korunan davranışlar

Bu remediation'ın açıkça değiştirmediği hiçbir davranış değiştirilmedi:

- Davet üretimi, hash'leme ve tüketme akışı — dokunulmadı
- Anonim kimlik doğrulama ve hesap bağlama — dokunulmadı
- Oy verme, çark ve kabul akışının kullanıcıya görünen davranışı — dokunulmadı
- TMDb arama, sağlayıcı sorgusu ve DEMO önizleme modu — dokunulmadı
- Append-only geçmiş: tur, aday, oy, seçim ve kabul satırları silinmiyor
- 30 / 14 / 7 günlük hard eligibility kuralları **hiçbir yerde gevşetilmedi**
- Partner oyları, kütüphanesi, profili, kabul ayrıntıları ve suppression
  nedenleri hiçbir yanıtta görünmüyor

---

## 13. Kapsam dışı bırakılanlar

İstendiği gibi başlanmadı: Recommendation V1, öneri araştırma prototipi,
`MovieDetailModal`, oyuncu/yönetmen araması, abonelikler, Teleparty,
seçim sonrası akış.

---

## 14. Yapılmayanlar (güvenlik kuralları gereği)

- Commit, push, deploy, merge, rebase, cherry-pick, stash yapılmadı
- Dal değiştirilmedi; `git reset`, `git clean`, `git restore`, `checkout` kullanılmadı
- **Hiçbir migration uygulanmadı**
- Production Supabase'e bağlanılmadı
- `.env.local` okunmadı, yazdırılmadı, değiştirilmedi
- `npm audit fix` çalıştırılmadı
- Docker / Supabase CLI / PostgreSQL **kurulmadı** (açık onay gerekir)

---

## 15. Bilinen sınırlar

1. **Veritabanı davranışı çalıştırılarak doğrulanmadı.** Kısıtlar, grant'ler,
   RLS, transaction semantiği ve yarışlar yalnızca kod incelemesi + statik SQL
   metin testi seviyesinde. Bu en büyük kalan risktir.
2. **Gerçek eşzamanlılık kapsanmadı.** 4 ve 5 numaralı senaryolar iki oturum
   gerektirir; prosedür belgelendi ama çalıştırılmadı.
3. **Legacy yükseltme yolu test edilmedi.** `02_upgrade_from_legacy.sql` yazıldı
   ama çalıştırılmadı; production benzeri veriyle yükseltmenin sorunsuz olduğu
   kanıtlanmış değil.
4. **Bakım penceresi kaçınılmaz.** RR-03 gereği migration ile deploy arasında
   yeni tur açma kapalıdır.
5. **`SUPABASE_SERVICE_ROLE_KEY` operasyonel bir yük getirir.** Anahtar
   rotasyonu, ortam ayrımı ve sızıntı izleme artık gereklidir.
6. **Ranker hâlâ seed'li karıştırmadır.** Kişiselleştirme yok; hard eligibility
   katmanı gelecekteki ranker'ı yapısal olarak sınırlıyor ama ranker'ın kendisi
   bu fazın dışında.

---

## 16. Depoda temizlenmemiş bir dosya

```
?? "erve reusable room implementation before remediation"
```

Bu dosya, checkpoint commit'i denenirken oluşan bir PowerShell tırnak hatasının
artığıdır ve içinde yakalanmış `git diff --stat` çıktısı vardır. Kaynak kod
değildir ve hiçbir yerden referans verilmez.

**Silmedim** — güvenlik kuralları kullanıcı çalışmasını atabilecek işlemleri
yasakladığı için buna kendi başıma karar vermedim. Onay verirsen tek komutla
kaldırırım.

---

## 17. Staging'de yapılması gerekenler

1. Atılabilir bir PostgreSQL/Supabase örneği hazırla (Docker veya `supabase start`).
2. `supabase/tests/README.md` içindeki komutla harness'ı çalıştır; 8 dosyanın
   tamamı `PASS` vermeli.
3. 4 ve 5 numaralı eşzamanlılık senaryolarını iki oturumla elle çalıştır.
4. Production benzeri bir veri kopyasıyla `02_upgrade_from_legacy.sql` akışını
   tekrarla.
5. `SUPABASE_SERVICE_ROLE_KEY`'i yalnızca sunucu ortamına ekle; `NEXT_PUBLIC_`
   karşılığının **olmadığını** doğrula.
6. Bakım penceresi sırasını (§4) staging'de bir kez prova et.
7. İki tarayıcıyla manuel akışı `ROOM_SELECTION_AND_WHEEL_SETUP.md` §4 adımlarına
   göre yürüt — özellikle 13, 14 ve 15. adımlar.

---

## 18. Sonraki faz için öneri

Phase B'ye (Recommendation V1) geçmeden önce **G'nin gerçekten çalıştırılmasını**
öneririm. Öneri motoru hard eligibility katmanının üstüne oturacak; o katmanın
gerçek bir veritabanında doğru davrandığı kanıtlanmadan üzerine sıralama mantığı
koymak, hatayı iki kat pahalı hale getirir.

---

## 19. Verdict

Kod ve şema tarafındaki remediation tamamlandı; tüm yerel doğrulamalar temiz.
Ancak veritabanı davranışı çalıştırılarak doğrulanmadı ve harness bilinçli olarak
**NOT RUN** raporlanıyor.

**READY FOR REAL DATABASE STAGING TESTS**
