# WatchMuse — Ortak Abonelik Kesişimi: Oturum Devri

**Tarih:** 1 Eylül 2026
**Dal:** `feature/reusable-room-candidates` (son commit `1de436d`, **bu oturumda commit atılmadı**)
**Depo:** `Mgucsav/WatchMuseDemoV1`

---

## 0. Tek cümlelik özet

Odaya giren iki kişi hangi platformlara abone olduğunu seçiyor; film önerileri
yalnızca **ikisinde de olan** platformlardan geliyor. Kod yazıldı ve yerel olarak
doğrulandı; **hiçbir şey commit edilmedi, push edilmedi, Supabase'e migration
uygulanmadı.**

---

## 1. Bu oturumda ne yapıldı

### 1.1 Platform kataloğu genişletildi

`src/lib/tmdb/constants.ts` → `TARGET_PROVIDERS` artık altı platform içeriyor:

| Anahtar | Etiket | TMDb sağlayıcı ID'leri |
| --- | --- | --- |
| `netflix` | Netflix | 8, 1796 (reklamlı) |
| `prime_video` | Amazon Prime Video | 119, 2100 (reklamlı) |
| `apple_tv_plus` | Apple TV+ | 350 |
| `disney_plus` | Disney+ | 337 |
| `blutv` | BluTV | 341 |
| `mubi` | MUBI | 11 |

Bu liste **tek kaynaktır**: hem film künyesindeki "aboneliğe dahil mi" satırları
hem odadaki seçim listesi buradan üretilir. Yeni platform eklemek için tek
değişiklik noktası burasıdır; SQL'e katalog gömülmemiştir.

### 1.2 Abonelik beyanı akışa girdi

- **Oda kurarken:** `RoomCreator` önce abonelik sorar, en az bir seçim olmadan
  oda açtırmaz.
- **Odaya katılırken:** `InviteRedeemer` artık sayfa açılır açılmaz daveti
  TÜKETMİYOR. Misafir önce aboneliklerini seçiyor, sonra "Odaya katıl" diyor.
  Sebep: davet tek kullanımlıktır; beyansız harcanması ortak kümesi boş bir
  odaya yol açardı.
- **Oda içinde:** `RoomWaiting` senin listeni, partnerin listesini ve ortak
  kümeyi gösteriyor; "Aboneliklerimi güncelle" ile kendi beyanını
  değiştirebiliyorsun (partnerinkine dokunulamıyor).

### 1.3 Öneriler ortak kanallardan geliyor

Filtre, dönen listeden sonradan eleme yaparak değil **TMDb keşif isteğinin
kendisinde** uygulanıyor (`src/lib/tmdb/search.ts`):

```text
/discover/movie
  watch_region=TR
  with_watch_providers=<ortak platformların ID'leri, | ile>   → VEYA
  with_watch_monetization_types=flatrate                       → kiralama/satın alma HARİÇ
```

Böylece ortak platformda olmayan film havuza **hiç girmiyor**. Ortak küme
istemciden alınmıyor; sunucu onu oda durumundan (RLS altında) türetiyor.

Dar katalogda (tek platform) sayfa sayısı azalabildiği için, aralık dışı kalan
sayfa isteği bir kez aralığa katlanıyor — havuz boş yere daralmıyor.

### 1.4 Veritabanı

Yeni migration: `supabase/migrations/20260814000100_room_subscriptions.sql`

- `participants.subscriptions text[]` — kişinin beyanı (boş = beyan yok, eski satırlar)
- `space_rounds.provider_keys text[]` — o turun toplandığı ortak küme
- `is_valid_subscription_keys(text[])` — biçim/tekillik/üst sınır doğrulaması, asla NULL dönmez
- `create_space(text, text[])` ve `join_space_with_invitation(text, text[])` — yeni imzalar
- Eski tek argümanlı imzalar **korundu ama** `subscriptions_required` hatası veriyor
- `set_participant_subscriptions(uuid, text[])` — yalnızca `auth.uid()` satırını günceller
- `start_next_space_round(...)` yeni imzaya taşındı (`p_provider_keys text[]`), eski 7 argümanlı imza **düşürüldü**

**Alt küme kuralı:** geçmiş turlardan tekrar aday alınırken
`prior_round.provider_keys <@ bugünün ortak kümesi` aranıyor. Yani biri
aboneliğini bıraktığında, eski turdan bir film sessizce geri dönemiyor. Migration
öncesi turlar `legacy_unknown` taşıyor ve bu testten hiçbir zaman geçemiyor.

**Veritabanı neyi doğrulayamaz:** "bu film gerçekten Netflix'te mi" — TMDb
katalog verisi orada yok. O garanti keşif isteğindeki filtreye dayanıyor. Bu
sınır migration başlığında ve `docs/ROOMS_ARCHITECTURE.md` §18'de yazılı.

### 1.5 Gizlilik kararı

Partnerin abonelik listesi oda ekranında **görünüyor**. Bu bilinçli: gizli
oylardan farklı olarak abonelik bir karar değil, ortak zemin arayan bir beyandır
ve kesişim boşsa kullanıcının neyi değiştireceğini bilmesi gerekir. Oylar,
kütüphane ve kabul olayları eskisi gibi paylaşılmıyor.

---

## 2. Dosya dökümü

### Yeni dosyalar

```text
src/lib/rooms/subscriptions.ts                      # saf model: kesişim, doğrulama, TMDb ID eşleme
src/lib/rooms/subscriptions.test.ts
src/lib/rooms/room-subscriptions-migration.test.ts  # migration sözleşmesi (statik metin testi)
src/lib/tmdb/search.test.ts                         # keşif isteğinin filtre parametreleri
src/components/rooms/SubscriptionPicker.tsx         # iki tarafın da kullandığı seçim bileşeni
src/app/api/rooms/[spaceId]/subscriptions/route.ts  # PUT — kendi beyanını güncelle
supabase/migrations/20260814000100_room_subscriptions.sql
supabase/tests/sql/08_subscription_intersection.sql
```

### Değiştirilen dosyalar

```text
src/lib/tmdb/types.ts          # TargetProviderKey birleşimi büyüdü
src/lib/tmdb/constants.ts      # TARGET_PROVIDERS altı platform
src/lib/tmdb/search.ts         # discoverRoomCandidatePage(page, providerIds)
src/lib/tmdb/client.ts         # demo modu total_pages + filtre notu
src/lib/tmdb/providers.test.ts # katalog büyümesine göre güncellendi
src/components/ProviderAvailability.tsx   # yeni platformların vurgu renkleri

src/lib/rooms/types.ts             # RoomState: my/partner/shared subscriptions
src/lib/rooms/errors.ts            # subscriptions_required, invalid_subscriptions, no_shared_subscriptions
src/lib/rooms/service.ts           # createRoom/joinRoom beyan alır, updateMySubscriptions eklendi
src/lib/rooms/localStore.ts        # yerel arka uç de beyan tutar
src/lib/rooms/round-service.ts     # p_provider_keys RPC'ye geçer
src/lib/rooms/candidate-pipeline.ts (+ .test.ts)   # plan providerKeys taşır

src/app/api/rooms/route.ts                   # POST gövdesi { subscriptions }
src/app/api/rooms/join/route.ts              # POST gövdesi { token, subscriptions }
src/app/api/rooms/[spaceId]/round/route.ts   # ortak küme boşsa TMDb'ye hiç gitmez
src/app/invite/[token]/page.tsx              # metin güncellendi

src/components/rooms/RoomCreator.tsx    # picker + boş seçimde buton kapalı
src/components/rooms/InviteRedeemer.tsx # otomatik tüketme kaldırıldı
src/components/rooms/RoomWaiting.tsx    # özet + güncelleme formu + tur kapısı
src/components/rooms/RoomRound.tsx      # canStartRound prop'u

supabase/tests/sql/00..07                # yeni imza ve beyan için güncellendi
supabase/tests/README.md                 # 08 dosyası ve 17-19 senaryoları
src/lib/rooms/db-integration-harness.test.ts

docs/ROOMS_ARCHITECTURE.md               # §18 abonelik kesişimi
ROOM_SELECTION_AND_WHEEL_SETUP.md        # §2 migration listesi + ikinci bakım penceresi
```

> **Not:** çalışma ağacında bu oturumdan ÖNCE gelen bekleyen iş de var
> (film detay modalı, reusable-room remediation, `supabase/tests/` harness'ı,
> `src/lib/supabase/admin.ts`). Hepsi aynı dalda, commit edilmemiş durumda.

---

## 3. Doğrulama durumu — dürüst tablo

| Kontrol | Sonuç |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx eslint` | PASS (exit 0) |
| `npx vitest run` | PASS — 26 dosya, 315 test, 19 `todo` |
| `npx next build` | PASS — yeni rota `/api/rooms/[spaceId]/subscriptions` kayıtlı |
| API uçtan uca (yerel oda arka ucu, `USE_LOCAL_ROOMS=true`) | PASS — oluşturma, katılma, kesişim, güncelleme, yabancı reddi |
| Sayfa render (`/rooms`, `/invite/<token>`) | PASS — seçim listesi görünüyor |
| **SQL entegrasyon paketi** | **ÇALIŞTIRILMADI** — bu makinede Postgres/Docker yok |
| **Gerçek TMDb ile tur açma** | **DENENMEDİ** — Supabase + service-role gerekiyor |

### Kanıtlanmamış sayılması gerekenler

- Alt küme kuralının (`provider_keys <@ ...`) gerçek veritabanında davranışı
- Yeni RPC'lerin grant'leri ve `set_participant_subscriptions` yetki sınırı
- Check constraint'lerin (`participants_subscriptions_valid`,
  `space_rounds_provider_keys_valid`) semantiği
- Migration'ın mevcut production verisi üzerinde sorunsuz yükselmesi

Bunlar `supabase/tests/sql/08_subscription_intersection.sql` içinde yazılı;
Postgres kurulduğunda `supabase/tests/README.md` içindeki komutla çalışır.

---

## 4. Açık riskler

1. **TMDb sağlayıcı ID'leri.** Netflix (8/1796) ve Prime Video (119/2100)
   kesin. Apple TV+ (350), Disney+ (337), BluTV (341), MUBI (11) standart
   JustWatch/TMDb ID'leri ama **TR kataloğunda doğrulanmadı**. Yanlış bir ID
   sessizce "o platformda film yok" gibi görünür — hata vermez.
   Kontrol: `GET /watch/providers/movie?watch_region=TR`.
2. **Bakım penceresi.** Migration `create_space` / `join_space_with_invitation`
   imzalarını değiştiriyor. Migration uygulandığı andan yeni kod yayına girene
   kadar **canlı sitede oda açma ve davete katılma çalışmaz** (mevcut odalarda
   oylama/çark/kabul çalışır).
3. **Eski odalar.** Migration öncesi katılımcıların beyanı boş. O odalarda yeni
   tur açılamaz; iki tarafın da "Aboneliklerimi güncelle" ile seçim yapması
   gerekir. Bu bir hata değil, tasarım gereği.
4. **Preview = production veritabanı.** Ayrı bir test projesi yoksa preview'da
   yapılan testler gerçek veriye yazar (odalar/turlar oluşur, silinmez).
5. **Dar ortak küme.** Tek ve küçük katalogla (ör. yalnız MUBI) 10 uygun aday
   bulunamayabilir; uygulama uydurma film eklemek yerine dürüstçe
   "Yeterli sayıda uygun film bulunamadı" der.

---

## 5. Kaldığım yerden devam: yapılacaklar

### Adım 1 — Vercel ortam değişkenleri (kod deploy etmeden önce kontrol)

| Değişken | Durum |
| --- | --- |
| `TMDB_ACCESS_TOKEN` | Olmalı, `NEXT_PUBLIC_` **olmadan** |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Olmalı |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yoksa ekle** — yeni tur açmak için zorunlu |
| `USE_LOCAL_ROOMS` / `NEXT_PUBLIC_USE_LOCAL_ROOMS` | Tanımlı **olmamalı** |
| `NEXT_PUBLIC_SITE_URL` | Preview'da test edeceksen Preview ortamında boş bırak, yoksa davet linki production adresine çıkar |

### Adım 2 — Supabase durum tespiti + yedek

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'space_rounds'
  and column_name in ('round_number', 'provider_keys');
```

- 0 satır → iki migration da uygulanmamış
- yalnız `round_number` → sadece `20260814...` gerekli
- ikisi de → migration zaten uygulanmış, Adım 3'ü atla

Devam etmeden Database → Backups'tan yedek al.

### Adım 3 — Migration'ları uygula (SQL Editor, sırayla, birer kez)

1. `supabase/migrations/20260813000100_reusable_rounds.sql` (uygulanmadıysa)
2. `supabase/migrations/20260814000100_room_subscriptions.sql`

Beklenen: `Success. No rows returned`. Doğrulama:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_space', 'join_space_with_invitation',
                    'start_next_space_round', 'set_participant_subscriptions')
order by 1, 2;
```

`create_space(text, text[])`, `join_space_with_invitation(text, text[])`,
`start_next_space_round(..., boolean, text[])` ve
`set_participant_subscriptions(uuid, text[])` görünmeli.

### Adım 4 — Commit ve push

```bash
git add -A
git commit -m "feat: filter room candidates by shared subscriptions"
git push -u origin feature/reusable-room-candidates
```

`.env.local` gitignore'da, sızmıyor. `WATCHMUSE_KALDIGIM_YERDEN_DEVAM_2026-08-25.md`
de commit'e girer; istemiyorsan tek tek ekle.

### Adım 5 — Preview'da uçtan uca test

İki ayrı oturum (normal + gizli pencere):

1. `/rooms` → abonelik seç (ör. Netflix + Prime) → oda oluştur → linki kopyala
2. Gizli pencerede link → farklı abonelik seç (ör. Netflix + Disney+) → katıl
3. "Ortak abonelikler: Netflix" görünmeli, 10 film gelmeli
4. Gelen filmleri TMDb'de doğrula: hepsi TR'de Netflix aboneliğine dahil olmalı
5. Ters senaryo: kesişimi boşalt → "Ortak abonelik yok" uyarısı, yeni tur açılamamalı

Vercel Deployment Protection açıksa davet linkini ikinci kişi açamaz.

### Adım 6 — Production

GitHub'da PR aç → `main`'e merge → Vercel production deploy → aynı testi canlı
adreste tekrarla.

---

## 6. İleride yapılabilecekler (bu oturumun kapsamı dışında)

- SQL entegrasyon paketini gerçek Postgres'te çalıştırmak (en yüksek değerli iş)
- TR sağlayıcı ID'lerini TMDb'den doğrulamak ve gerekirse katalogu düzeltmek
- Katalogu genişletmek: TOD, Gain, Exxen (ID'leri doğrulanmalı) — tek değişiklik
  noktası `TARGET_PROVIDERS`, migration gerekmez
- Ortak küme daraldığında kullanıcıya "şu filmler artık uygun değil" özeti
- Oda dışında (film arama) da kullanıcının kendi aboneliklerine göre filtreleme

---

## 7. Bir sonraki oturuma hızlı giriş

```bash
cd "C:\Users\editör_01\Desktop\Movie Search Demo"
git status                 # her şey hâlâ commit edilmemiş olmalı
npx vitest run             # 315 test geçmeli
```

Okuma sırası: bu dosya → `docs/ROOMS_ARCHITECTURE.md` §18 →
`supabase/migrations/20260814000100_room_subscriptions.sql` başlığı →
`src/lib/rooms/subscriptions.ts`.
