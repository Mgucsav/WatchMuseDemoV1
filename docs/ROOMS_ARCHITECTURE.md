# WatchMuse — Oda ve Katılımcı Mimarisi

Bu belge, iki kişilik özel oda temelinin (spaces / participants / invitations)
güven sınırlarını, davet akışını ve güvenlik varsayımlarını açıklar.

**Kapsam:** kalıcı oda/katılımcı temeli ile append-only film turları, gizli
oylama, ortak çark ve seçilen filmi kişisel izleme listesine kabul etme akışı.

---

## 1. Güven sınırları

```
┌──────────────────────────────────────────────────────────────────────┐
│ TARAYICI                                        GÜVENİLMEZ           │
│                                                                      │
│  • anon (publishable) anahtarı — gizli değil, tek başına yetki vermez│
│  • anonim oturum JWT'si (çerezde)                                    │
│  • davet bağlantısındaki DÜZ METİN TOKEN                             │
│                                                                      │
│  Buradan gelen hiçbir değer yetkilendirme için yeterli sayılmaz.     │
│  spaceId dahil her girdi sunucuda yeniden doğrulanır.                │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS · token yalnızca POST gövdesinde
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ NEXT.JS SUNUCUSU                                GÜVENİLİR            │
│                                                                      │
│  src/lib/rooms/tokens.ts    ← düz metin token BURADA üretilir        │
│  src/lib/rooms/service.ts   ← SHA-256 BURADA hesaplanır              │
│  src/lib/supabase/server.ts ← kullanıcının çereziyle Supabase        │
│  src/lib/supabase/admin.ts  ← service_role · server-only · SADECE    │
│                               yeni tur açan RPC için                 │
│  src/proxy.ts               ← oturum tazeleme                        │
│                                                                      │
│  ★ Düz metin token bu katmanın DIŞINA yalnızca davet bağlantısı      │
│    olarak çıkar. Veritabanına asla gönderilmez.                      │
│  ★ service_role anahtarı tarayıcıya ASLA gönderilmez, loglanmaz ve   │
│    NEXT_PUBLIC_ karşılığı yoktur. Yalnızca üyelik kanıtlandıktan     │
│    SONRA, tek bir güvenilen RPC için kullanılır (§13a).              │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ RPC · yalnızca SHA-256 hash (hex)
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SUPABASE AUTH            │  POSTGRES                GÜVENİLİR        │
│                          │                                           │
│  anonim kullanıcı        │  RLS + SECURITY DEFINER fonksiyonlar      │
│  → auth.uid()            │  create_space / join_space_with_invitation│
│                          │  spaces · participants · invitations      │
│                          │                                           │
│  Nihai yetkilendirme burada yapılır. Uygulama katmanı atlanabilse    │
│  bile RLS politikaları geçerliliğini korur.                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Temel ilke:** uygulama katmanı tamamen atlansa (biri doğrudan PostgREST'e
istek atsa) bile güvenlik modeli çökmemelidir. Tüm kritik kısıtlar
veritabanındadır.

---

## 2. Neden anonim kimlik doğrulama?

RLS'in çalışması için kararlı ve sahtelenemez bir `auth.uid()` gerekir.

- **Kayıt sürtünmesi yok.** Ürün iki kişinin hızlıca film seçmesi üzerine
  kurulu; e-posta/parola akışı bu değeri düşürürdü.
- **Kimlik yine de doğrulanabilir.** Anonim kullanıcı da gerçek bir
  `auth.users` satırıdır; JWT Supabase tarafından imzalanır ve tarayıcı bunu
  taklit edemez.
- **localStorage yeterli olmaz.** Oda üyeliği yetkilendirme kararıdır;
  tarayıcıda tutulan bir değer istemci tarafından değiştirilebilir. Katılımcı
  listesi bu yüzden veritabanında tutulur ve RLS ile korunur.

**Sonuç:** kimlik "kim olduğunu bilmiyoruz ama bu tarayıcının aynı tarayıcı
olduğunu kanıtlayabiliyoruz" düzeyindedir — iki kişilik özel oda için yeterli.

---

## 3. Token üretimi ve hash'leme

```
1. createRoom()                     [Next.js sunucu]
   token = randomBytes(32) → base64url      (256 bit entropi, 43 karakter)
   hash  = sha256(token) → hex              (64 karakter)

2. rpc('create_space', { p_token_hash: hash })
   ─────────────────────────────────────────────►  Postgres
   ▲ yalnızca HASH gider. Düz metin token veritabanını hiç görmez.

3. Veritabanı BAŞARILI dönerse:
   inviteUrl = https://<site>/invite/<token>
   ▲ bağlantı ancak şimdi kurulur; başarısız oluşturmada
     kullanıcıya çalışmayan bir davet gösterilmez.
```

### Güven sınırı kararı: neden hash gönderiyoruz, düz metin değil?

| | Düz metni RPC'ye gönder | **Hash'i RPC'ye gönder (seçilen)** |
|---|---|---|
| Postgres logları | Token `log_statement`/yavaş sorgu kaydına düşebilir | Düz metin veritabanını hiç görmez |
| Veritabanı dökümü sızarsa | Hash işe yaramaz | Hash ile davet kullanılabilir |
| Uygulama sınırı | Postgres'in de güvenilir olması gerekir | Düz metin tek bir katmanda kalır |

**Seçim gerekçesi:** gerçekçi tehdit, canlı bir kimlik bilgisinin log/gözlem
katmanına sızmasıdır — veritabanı dökümü zaten tam ihlal demektir. Ayrıca
kullanılmamış davetler 24 saatte sona erer.

**Kabul edilen ödünleşim:** hash, bu RPC için hamiline yazılı bir bilgi haline
gelir. Risk sınırlıdır çünkü `invitations` tablosunda **hiç RLS politikası
yoktur** (hiçbir istemci hash okuyamaz) ve SHA-256 ön görüntü dirençlidir.

**İleride sertleştirme:** SHA-256 yerine sunucuda tutulan bir gizli anahtarla
**HMAC-SHA256** kullanmak, veritabanı dökümü sızsa bile tekrar kullanımı
engeller. Bu aşamada gereksinim SHA-256 olduğu için uygulanmadı.

---

## 4. Oda oluşturma akışı

```
Tarayıcı                Next.js sunucu              Postgres
   │
   │ ensureAnonymousSession()
   │ ───────────────────────────────────────────────► auth.users
   │ ◄─────────────────────────────────────────────── JWT (çerez)
   │
   │ POST /api/rooms
   │ ──────────────────────►
   │                        token = randomBytes(32)
   │                        hash  = sha256(token)
   │                        │
   │                        │ rpc create_space(hash)
   │                        │ ─────────────────────►  ┌─ TEK TRANSACTION ─┐
   │                        │                         │ insert spaces      │
   │                        │                         │ insert participants│
   │                        │                         │   (role = host)    │
   │                        │                         │ insert invitations │
   │                        │                         │   expires = +24h   │
   │                        │ ◄─── space_id ───────── └────────────────────┘
   │                        │
   │                        inviteUrl = base + /invite/ + token
   │ ◄── { spaceId, inviteUrl, invitationExpiresAt }
```

`create_space` SECURITY DEFINER'dır ve içeride `auth.uid()` doğrular. Davet
ömrü **veritabanında sabittir (24 saat)** — istemci uzatamaz.

---

## 5. Davet tüketme akışı

```
Tarayıcı                     Next.js sunucu            Postgres
   │ GET /invite/<token>
   │ ◄── sayfa (üçüncü taraf kaynak YOK, Referrer-Policy: no-referrer)
   │
   │ ensureAnonymousSession()
   │
   │ POST /api/rooms/join  { token }        ← token GÖVDEDE, URL'de değil
   │ ─────────────────────────►
   │                          biçim kontrolü (43 karakter base64url)
   │                          hash = sha256(token)
   │                          │ rpc join_space_with_invitation(hash)
   │                          │ ────────────────►  ┌── TEK TRANSACTION ──────┐
   │                          │                    │ SELECT invitation        │
   │                          │                    │   FOR UPDATE  ← kilit    │
   │                          │                    │ SELECT space FOR UPDATE  │
   │                          │                    │ oda aktif mi?            │
   │                          │                    │ zaten üye mi?            │
   │                          │                    │   host → host_cannot_join│
   │                          │                    │   guest → idempotent OK  │
   │                          │                    │ used_at? → already_used  │
   │                          │                    │ expires? → expired       │
   │                          │                    │ count >= 2 → room_full   │
   │                          │                    │ insert participant guest │
   │                          │                    │ update invitation used   │
   │                          │ ◄── {space_id,…} ── └──────────────────────────┘
   │ ◄── { spaceId, role }
   │
   │ router.replace(/rooms/<spaceId>)   ← TEMİZ URL, token yok
```

### Eşzamanlılık

- **Aynı davetle iki istek:** `SELECT … FOR UPDATE` davet satırını kilitler.
  İkinci istek kilidi aldığında `used_at` dolu olur → `invitation_already_used`.
- **Farklı davetlerle aynı odaya:** oda satırı da kilitlenir; katılımcı sayımı
  bu kilit altında güvenilirdir → `room_full`.
- **Son savunma:** `unique(space_id, role)` kısıtı. Her şey başarısız olsa bile
  ikinci `guest` satırı veritabanı seviyesinde reddedilir; fonksiyon bunu
  yakalayıp `room_full` üretir.

---

## 6. İki kişi sınırı nasıl garanti edilir?

Bu, uygulama mantığına **değil**, şemaya dayanır:

```sql
create type public.participant_role as enum ('host', 'guest');   -- tam 2 değer
constraint participants_unique_role_per_space unique (space_id, role)
```

Rol enum'unun iki değeri olduğu ve `(space_id, role)` benzersiz olduğu için bir
odada **en fazla iki satır** bulunabilir. Bu garanti eşzamanlılık altında da,
uygulama tamamen atlansa da geçerlidir.

> ⚠️ Enum'a üçüncü bir rol eklemek bu garantiyi **sessizce bozar**.

---

## 7. RLS varsayımları

| Tablo | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `spaces` | yalnızca odanın katılımcısı | **politika yok** → reddedilir |
| `participants` | yalnızca aynı odanın katılımcısı | **politika yok** → reddedilir |
| `invitations` | **politika yok** → reddedilir | **politika yok** → reddedilir |

Ek olarak ayrıcalık seviyesinde de geri alma yapılır:

```sql
revoke insert, update, delete on public.spaces       from anon, authenticated;
revoke insert, update, delete on public.participants from anon, authenticated;
revoke all                    on public.invitations  from anon, authenticated;
```

Böylece gereksinimler karşılanır:

- ✅ Kullanıcı bir odayı ancak **katılımcı olduktan sonra** okuyabilir — davet
  bağlantısına sahip olmak tek başına okuma yetkisi vermez.
- ✅ Kullanıcı kendini doğrudan `INSERT` ile katılımcı yapamaz.
- ✅ Kullanıcı rolünü değiştiremez (`UPDATE` politikası yok).
- ✅ Kullanıcı davet hash'lerini göremez.
- ✅ Kullanıcı ilgisiz odaları okuyamaz.
- ✅ İstemci tarafı yazımla iki kişi sınırı aşılamaz (yazım hiç yok).

### Özyineleme uyarısı

`participants` üzerindeki bir politikanın gövdesinde yine `participants`
sorgulamak Postgres'te **sonsuz özyineleme** hatası verir. Bu yüzden
`public.is_space_participant(uuid)` adlı `SECURITY DEFINER` yardımcı fonksiyon
kullanılır; RLS'i atlayarak döngüyü kırar ve yalnızca `boolean` döndürür.

### SECURITY DEFINER sertleştirmesi

Üç fonksiyonun tamamında:

- `set search_path = ''` — arama yolu ele geçirilemez
- tüm nesneler şema nitelikli (`public.…`, `auth.…`)
- `auth.uid()` fonksiyon **içinde** doğrulanır
- `revoke all … from public` ve `from anon`
- `grant execute … to authenticated`

---

## 8. Davet bağlantısı güvenliği

| Önlem | Uygulama |
|---|---|
| ≥ 256 bit entropi | `randomBytes(32)` |
| URL güvenli | `base64url` (43 karakter, `+ / =` yok) |
| Düz metin saklanmaz | Veritabanına yalnızca SHA-256 hex gider |
| Hash istemciye verilmez | `invitations` üzerinde RLS politikası yok |
| Token loglanmaz | Kod tabanında `console.*` yok; hata mesajları sabit sözlükten |
| Süre sınırı | 24 saat, **veritabanında** sabit |
| Tek kullanım | `used_at` aynı transaction'da işaretlenir |
| Referrer sızıntısı | `/invite/:token*` için `Referrer-Policy: no-referrer` |
| Önbellek | `/invite/:token*` için `Cache-Control: no-store` |
| Dizine ekleme | `X-Robots-Tag: noindex, nofollow` + sayfa metadata |
| Üçüncü taraf kaynak | Davet sayfası hiç yüklemez; fontlar `next/font` ile derleme zamanı indirilip kendi alan adımızdan sunulur |
| Temiz URL | Başarıdan sonra `router.replace('/rooms/<id>')` |
| Hata yankısı | `normalizeRoomError` mesajı **daima** sabit sözlükten alır |

---

## 9. Migration'ları uygulama ve doğrulama

Migration'lar `supabase/migrations/` altında ve **sıralıdır**:

```
20260811000100_rooms_schema.sql      şema, enum, kısıt, indeks, trigger
20260811000200_rooms_rls.sql         RLS, politikalar, ayrıcalık geri alma
20260811000300_rooms_functions.sql   atomik RPC'ler, grant/revoke, yorumlar
```

### Uygulama

**Seçenek A — Supabase CLI (önerilir):**

```bash
supabase link --project-ref <proje-ref>
supabase db push
```

**Seçenek B — Dashboard SQL Editor:**
Üç dosyayı **yukarıdaki sırayla** yapıştırıp çalıştırın. Sıra önemlidir:
RLS şemaya, fonksiyonlar da RLS'e bağımlıdır.

### Doğrulama sorguları

```sql
-- 1) RLS üç tabloda da açık mı? (üçü de true olmalı)
select relname, relrowsecurity
from pg_class
where relname in ('spaces','participants','invitations');

-- 2) invitations'ta HİÇ politika olmamalı (0 satır)
select * from pg_policies where tablename = 'invitations';

-- 3) Fonksiyonlar SECURITY DEFINER ve search_path='' mi?
select p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_space','join_space_with_invitation','is_space_participant');

-- 4) anon RPC çalıştıramamalı (false dönmeli)
select has_function_privilege('anon','public.create_space(text)','execute');

-- 5) authenticated çalıştırabilmeli (true dönmeli)
select has_function_privilege('authenticated','public.create_space(text)','execute');

-- 6) İki kişi sınırı kısıtı yerinde mi?
select conname from pg_constraint where conname = 'participants_unique_role_per_space';
```

### Supabase Dashboard yapılandırması

1. **Authentication → Providers → Anonymous sign-ins: ENABLED**
   (varsayılan kapalıdır; açılmazsa oda oluşturma başarısız olur)
2. **Project Settings → API** → `Project URL` ve `anon`/`publishable` anahtarı
   `.env.local` içine yazılır.
3. **Project Settings → API** → `service_role` (secret) anahtarı alınır ve
   YALNIZCA sunucu ortamına `SUPABASE_SERVICE_ROLE_KEY` adıyla yazılır
   (`.env.local` ya da Vercel Environment Variables → yalnız sunucu). Tarayıcıya
   gönderilmez, `NEXT_PUBLIC_` önekiyle **asla** tanımlanmaz. Kullanım sınırı
   için §13a.
4. Anonim kullanıcı kötüye kullanımını sınırlamak için
   **Authentication → Rate Limits** gözden geçirilmelidir.

---

## 10. Kalan riskler

| Risk | Değerlendirme |
|---|---|
| **Veritabanı davranışları entegrasyon testi ile doğrulanmadı** | Bu ortamda Supabase CLI/Docker/psql yok. RLS, atomiklik ve eşzamanlılık **yalnızca tasarım incelemesiyle** doğrulanmıştır. Bkz. §11. |
| Anonim kullanıcı çoğalması | Her yeni tarayıcı profili yeni `auth.users` satırı üretir. Temizlik politikası yok. |
| Davet oluşturmada hız sınırı yok | Kimliği doğrulanmış kullanıcı çok sayıda oda açabilir. Supabase rate limit'i kısmen sınırlar. |
| Hash hamiline yazılı | Veritabanı dökümü sızarsa kullanılmamış davetler kullanılabilir. HMAC + sunucu gizli anahtarı bunu kapatır (§3). |
| Oda kapatma akışı yok | `status` sütunu var ama `closed`'a geçiren bir arayüz/RPC yok. |
| Bekleme odası yoklama ile çalışıyor | 5 saniyede bir istek. Supabase Realtime daha verimli olurdu; kapsam dışı bırakıldı. |
| Token tarayıcı geçmişinde | `replace` ile temizlenir, ancak davet **ilk** açılışında adres çubuğunda görünür. Kaçınılmaz; `no-referrer` ile sınırlandırıldı. |
| `display_name` kullanılmıyor | Sütun var, arayüz yok. |

---

## 11. Yeniden kullanılabilir oda yaşam döngüsü

`spaces` aynı iki katılımcı için kalıcı bağlamdır; ayrı `pairs` tablosu yoktur.
Her yeni seçim, aynı `space_id` altında artan `round_number` ile yeni bir
`space_rounds` satırı açar. `result` ve `no_match` terminaldir. Eski tur, aday
ve oy satırları silinmez.

```text
space (kalıcı)
  ├─ round 1 → candidates + votes → result/no_match
  ├─ round 2 → candidates + votes → result/no_match
  └─ round N → en fazla bir aktif voting/matching/spinning
```

Oda satırı `FOR UPDATE` ile tur başlatma transaction'ını serileştirir; partial
unique index ayrıca oda başına en fazla bir non-terminal turu garanti eder.
İkinci eşzamanlı istek mevcut aktif tur kimliğini döndürür.

## 12. Event-query aday politikası

Kaynak gerçekler `space_rounds`, `room_candidates`, `room_votes`,
`room_selections` ve `room_selection_acceptances` satırlarıdır. Trigger ile
güncellenen aggregate/signal tablosu yoktur.

- iki `skip`: ortak kararın son oy zamanından itibaren 30 gün hard suppression,
- karışık oy: suppression yok,
- iki `want`, çarkta seçilmedi: 14 gün içinde tek priority-return fırsatı,
- `priority_return` olarak bir kez gösterilince fırsat tüketilir,
- yeni görünüm yine iki `want` ve seçilmeme üretirse yeni fırsat kazanılabilir,
- yedi gün içinde en az bir acceptance: o space için kalıcı suppression,
- acceptance yok ve yedi gün doldu: normal uygunluk.

### Keşif / uygun tekrar sınırı

Aday seçimi **üç ayrı geçiştir** ve her adayın `selection_reason` değeri **onu
seçen geçişten** gelir; seçim sonrası çıkarımla üretilmez.

| Geçiş | Kapsam |
| --- | --- |
| `priority_return` | 14 gün içinde both-want olup çarkta seçilmemiş, fırsatı tüketilmemiş filmler |
| `fresh_discovery` | Bu space'in **TÜM geçmişinde** hiç aday olmamış filmler |
| `eligible_repeat` | Yalnızca `p_allow_eligible_repeats = true` iken; geçmişte görülmüş ama bastırılmamış filmler |

`fresh_discovery` yalnızca bir önceki turu değil, **space'in bütün geçmişini**
dışlar: iki, üç ya da otuz tur önce gösterilmiş bir film gerçek keşif sayılmaz.

Değişmez kurallar (`start_next_space_round` içinde uygulanır):

- `priority_return` + `eligible_repeat` toplamı **en fazla 9 slot** alabilir,
- **en az 1 slot gerçek `fresh_discovery`** olmak zorundadır,
- hard suppression (kabul edilmiş seçim, açık yedi günlük pencere, son 30 gün
  içinde iki taraflı skip) **son bounded denemede bile açılmaz**,
- final liste tam 10 benzersiz TMDb ID olmak zorundadır.

Bunlar sağlanamazsa RPC `candidate_pool_incomplete` ile durur ve **hiçbir tur ya
da aday satırı yazılmaz**. Havuz asla uygun olmayan filmle doldurulmaz; uygulama
kullanıcıya dürüstçe başarısızlık bildirir.

Uygulama katmanı `allowEligibleRepeats` bayrağını yalnızca son bounded TMDb
denemesinde açar (`src/lib/rooms/candidate-pipeline.ts`). Bu bayrak bir izin
değil, bir **talep**tir; yukarıdaki değişmez kurallar onu ezer.

## 13. Seed ve gelecekteki ranker sınırı

Sunucu her tur için seed üretir. TMDb sayfa sırası ve TypeScript kaynak sırası
deterministiktir; hard eligibility filtresi Postgres içinde uygulanır. Son ranker
yalnızca filtrelenmiş eligible satırları sıralayabilir, yeni ID ekleyemez.

```text
sourcing → hard eligibility → mandatory priority → rank → unique/diversity
         → atomik final-10 persistence
```

`selection_seed`, `selection_policy_version`, `ranker_version`, aday
`selection_reason` ve `position` audit için saklanır. `selection_policy_version`
ve `ranker_version` sunucu sabitlerinden gelir; istemciden alınmaz.
`selection_reason` uygulama katmanında hiç üretilmez — onu yalnızca adayı seçen
SQL geçişi yazar. TMDb içeriği gelecekte
değişebileceğinden seed tek başına replay garantisi değildir; kalıcı final 10
otoritatif kayıttır. Tür/kütüphane/ML sıralaması bu fazın dışındadır ve hard
eligibility katmanını atlayamaz.

## 13a. Güvenilen aday-planı sınırı

Yeni tur açan RPC istemci rollerine **kapalıdır**:

```sql
revoke all on function
  public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)
  from public, anon, authenticated;

grant execute on function
  public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)
  to service_role;
```

Bir oda üyesi Supabase Data API üzerinden bu fonksiyonu doğrudan çağırıp kendi
aday listesini, seed'ini, policy sürümünü ya da `selection_reason` değerini
dayatamaz. `is_movie_hard_suppressed` de aynı şekilde istemci rollerine kapalıdır
(bastırma nedenleri sızmasın diye).

Çağrı zinciri ve sırası (`src/lib/rooms/round-service.ts`):

```text
1. requireSpaceMember(spaceId)      ← KULLANICI OTURUMU (RLS)
     └─ auth.getUser() + participants okuması → aktörün UUID'si kanıtlanır
2. sourceAndPersistRoundCandidates  ← sunucu boru hattı: seed, sayfa sırası,
                                       ranker, policy sürümü
3. createSupabaseAdminClient()      ← service_role, YALNIZCA 1. adım geçtiyse
4. rpc start_next_space_round(p_actor_id = 1. adımda kanıtlanan UUID)
     └─ SQL, aktörün odaya üyeliğini BAĞIMSIZ olarak yeniden doğrular
```

Sıra anlamlıdır: yönetimsel istemci, üyelik kanıtlanmadan **oluşturulmaz bile**.
`src/lib/supabase/admin.test.ts` bu sırayı statik olarak doğrular.

Kimlik bilgisi kuralları:

- değişken adı `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_` karşılığı **yoktur**
  ve asla oluşturulmamalıdır,
- yalnızca `src/lib/supabase/admin.ts` okur; modül `server-only` ile işaretlidir,
  istemci paketine alınırsa derleme kırılır,
- değer loglanmaz, hata mesajına konmaz, yanıtla döndürülmez; yapılandırma
  hataları yalnızca **değişken adını** söyler,
- değişken tanımsızsa uygulama `not_configured` döndürür ve sessizce daha zayıf
  bir yola **düşmez**,
- depoda gerçek bir anahtar yoktur; `.env.example` yalnızca adı belgeler.

## 13b. Eski RPC ve devreye alma sırası

`create_or_reset_space_round` kalıcı bir authenticated aday-üretim kapısı olarak
**bırakılmamıştır**. `authenticated` rolünden EXECUTE geri alınmıştır ve gövdesi
artık aday planı kabul etmez, kaydetmez; `round_creation_moved` domain hatası
fırlatır. Eski istemciler sessizce yanlış davranmak yerine anlaşılır bir hata
alır.

Sonuç: **migration önce uygulanırsa, henüz güncellenmemiş istemciler yeni tur
açamaz.** Bu kasıtlıdır ve kısa bir bakım penceresi gerektirir.

Bakım penceresi sırası:

1. `SUPABASE_SERVICE_ROLE_KEY` sunucu ortamına eklenir (yalnızca sunucu; önizleme
   ve production ayrı ayrı).
2. Bakım penceresi duyurulur. Bu pencerede **yeni tur açma kapalıdır**; devam
   eden turlarda oylama, çark ve kabul çalışmaya devam eder.
3. `20260813000100_reusable_rounds.sql` uygulanır.
4. Yeni uygulama sürümü dağıtılır (`requireSpaceMember` + yönetimsel istemci
   yolu ile birlikte).
5. Doğrulama: bir oda ile yeni tur açılır, `selection_reason` değerleri ve
   `round_number` artışı kontrol edilir.
6. Pencere kapatılır.

Sıra ters çevrilirse (önce uygulama, sonra migration) yeni uygulama eski imzayı
bulamaz ve yine tur açılamaz; bu yüzden **migration önce** uygulanır ve pencere
mümkün olduğunca kısa tutulur.

## 14. Seçilen film ve kişisel kütüphane

Çarkla birlikte `room_selections` olayı ve yedi günlük deadline yazılır. Her
katılımcı bağımsız olarak `accept_room_selection` çağırabilir. Tek transaction:

1. üyelik ve deadline doğrulanır,
2. `unique(selection_id,user_id)` acceptance olayı yazılır,
3. yalnızca çağıranın `library_items` kaydı watchlist'e eklenir/upsert edilir,
4. selection'ın ilk kabul zamanı kalıcılaştırılır.

Kütüphane satırı daha sonra silinse bile acceptance olayı silinmez. Partnerin
kütüphanesi hiçbir zaman değiştirilmez. Kişisel kütüphane yalnız “İzlenecek
Filmlerim” ve “İzlediklerim” bölümlerini taşır; izlenmiş puanı/notu opsiyoneldir.

## 15. Gizlilik, RLS ve polling

`room_votes`, `room_selections` ve `room_selection_acceptances` doğrudan istemci
okumasına açık değildir. `get_space_round_state` yalnız final adayları,
çağıranın kendi oyları ve kendi `myAccepted` değerini döndürür. Partner oyları,
partner kütüphanesi, sayaçlar, suppression listeleri ve nedenleri dönmez.

Polling durum bazlıdır:

- kullanıcı kartları oylarken sürekli polling yok,
- kendi 10 oyunu tamamlayıp partneri beklerken 3 saniye,
- matching beklerken 3 saniye,
- spinning sırasında 1,2 saniye,
- `result` / `no_match` sonrası **30 saniyede bir düşük frekanslı yenileme**.

Terminal durumda polling tamamen durmaz. Partner yeni bir tur açtığında ekranda
kalan istemci bunu tam sayfa yenilemeden görür. 1,2 saniyelik yüksek frekans
terminal durumda **geri getirilmemiştir**; 30 saniye bilinçli bir tercihtir
(`TERMINAL_POLL_INTERVAL_MS`, `src/lib/rooms/polling-policy.ts`).

Geçici hata toleransı: ağ ya da 5xx kaynaklı geçici polling hatası ekranı hemen
kalıcı hata durumuna düşürmez. `MAX_TRANSIENT_POLL_FAILURES` (3) denemeye kadar
sessizce yeniden denenir ve kullanıcıya yalnızca “bağlantı yeniden deneniyor”
bilgisi gösterilir; bu sınır aşılınca kalıcı hata ekranı gelir. Yetki/oturum
hataları geçici sayılmaz ve hemen yüzeye çıkar.

Bekleyen seçim ekranı süresiz açık kalmaz: yedi günlük pencere dolduğunda kart
kendini süresi dolmuş olarak gösterir (`isSelectionExpired`); süre bilgisi 30
saniyelik bir tick ile tazelenir ve bu tick yalnızca bekleyen seçim varken çalışır.

Aksiyon hataları (yeni tur açma, kabul) artık **RoomRound durumunu atmaz**;
mevcut ekran korunur ve hata satır içi gösterilir, böylece kullanıcı oylarını ya
da bekleyen seçimi kaybetmez.

Her state geçişinde timer temizlenir ve in-flight fetch abort edilir. Realtime
eklenmemiştir.

## 16. Migration ve doğrulama sınırı

Yeni migration:
`supabase/migrations/20260813000100_reusable_rounds.sql`.

Bu migration önce `20260812000200_room_rounds_votes_and_wheel.sql` sonrasında
manuel uygulanır; devreye alma sırası için §13b. Manuel iki tarayıcı akışı için
`ROOM_SELECTION_AND_WHEEL_SETUP.md` izlenir.

### İlişkisel bütünlük (şema seviyesi)

Migration üç composite kısıt ekler; bunlar uygulama mantığından bağımsız olarak
tutarsız satır yazılmasını engeller:

| Kısıt | Ne garanti eder |
| --- | --- |
| `space_rounds_winner_belongs_to_round` | `winner_candidate_id` **kendi turunun** adayı olmak zorunda (deferrable) |
| `room_selections_round_space_fk` | Seçimin `space_id` değeri turun `space_id` değeriyle eşleşmek zorunda |
| `room_selections_candidate_chain_fk` | Seçim `(candidate_id, round_id, tmdb_movie_id)` zinciri tek parça hareket eder |

Cascade davranışı append-only geçmişi korur: bir tur silinmedikçe adayları,
oyları ve seçimleri de silinmez; normal yaşam döngüsünde tur **hiç silinmez**.

### Doğrulama sınırı

SQL/RLS/eşzamanlılık davranışları **gerçek bir PostgreSQL üzerinde
çalıştırılmadıkça doğrulanmış sayılmaz**.

`src/lib/rooms/reusable-round-migration.test.ts` SQL *metnini* regex ile okur;
bu bir **entegrasyon testi değildir** ve öyle sunulmamalıdır. Gerçek veritabanı
harness'ı `supabase/tests/` altındadır ve depoda hazırdır, ancak **bu makinede
çalıştırılmamıştır** (`docker`, `psql`, `supabase` CLI ve yerel PostgreSQL kurulu
değil; sistem yazılımı kurmak açık onay gerektirir). Durum
`supabase/tests/README.md` içinde ve `npm test` çıktısında 23 `todo` girdisi
olarak görünür.

---

## 17. Entegrasyon testi ile doğrulanması gerekenler

Aşağıdakiler **kod incelemesiyle tasarlanmış ancak çalıştırılarak
doğrulanmamıştır**. Çoğu için SQL harness'ı `supabase/tests/sql/` altında
yazılmıştır; Supabase CLI + Docker ya da yerel PostgreSQL kurulduğunda
`supabase/tests/README.md` içindeki komutla çalıştırılmalıdır:

- [ ] Host oda oluşturur; `spaces` + `participants(host)` + `invitations` oluşur
- [ ] Misafir davetle katılır; `participants(guest)` eklenir ve davet tüketilir
- [ ] Davetin tekrar kullanımı reddedilir
- [ ] Süresi dolmuş davet reddedilir
- [ ] Üçüncü katılımcı reddedilir
- [ ] Host kendi davetiyle misafir olamaz
- [ ] **Eşzamanlı katılım**: aynı davetle paralel iki istekten tam olarak biri başarılı olur
- [ ] Yetkisiz okuma: katılımcı olmayan `spaces`/`participants` satırı göremez
- [ ] `invitations` hiçbir istemci rolü tarafından okunamaz
- [ ] Doğrudan `INSERT`/`UPDATE` denemeleri reddedilir
- [ ] Terminal turdan sonra yeni tur açılır; eski aday/oylar kalır
- [ ] Eşzamanlı iki yeni-tur isteği tam bir aktif tur üretir
- [ ] Priority-return aynı fırsat için yalnız bir kez tüketilir
- [ ] Acceptance yalnız çağıranın kütüphanesini değiştirir ve idempotenttir
- [ ] Süresi dolmuş selection kabul edilemez
- [ ] Partner oy/kütüphane/acceptance bilgisi hiçbir API yanıtında görünmez
- [ ] `authenticated` rolü `start_next_space_round` çağıramaz, `service_role` çağırabilir
- [ ] Üye olmayan `p_actor_id` ile tur açılamaz; `p_actor_id` null ise reddedilir
- [ ] Eski `create_or_reset_space_round` çağrısı `round_creation_moved` verir
- [ ] İki veya daha eski turda görülmüş film, repeat kapısı kapalıyken seçilmez
- [ ] Son bounded denemede bile hard suppression açılmaz ve ≥1 gerçek keşif kalır
- [ ] Bozuk sayısal aday alanı `invalid_candidates` verir, cast hatası vermez
- [ ] Composite kısıtlar başka turun adayına/space'ine bağlanmayı reddeder
- [ ] Legacy veriyle yükseltme geçmişi silmez ve backfill alanlarını doldurur
- [ ] Abonelik beyanı olmadan oda açılamaz ve davet tüketilemez
- [ ] Ortak abonelik kümesi boşken tur açılamaz (`no_shared_subscriptions`)
- [ ] Daralan ortak kümede eski turun filmi tekrar aday olamaz
- [ ] Katılımcı yalnızca kendi abonelik beyanını değiştirebilir

## 18. Abonelik beyanı ve ortak platform kesişimi

Her katılımcı odaya girerken hangi platformlara abone olduğunu **beyan eder**:
oda sahibi odayı açarken, misafir daveti tüketirken. Öneriler yalnızca iki
beyanın **kesişiminden** üretilir.

```text
host beyanı      { netflix, prime_video, mubi }
guest beyanı     { netflix, mubi, disney_plus }
                 ─────────────────────────────
ortak küme       { netflix, mubi }   → TMDb discover filtresi
```

### Filtre nerede uygulanır?

Veritabanında TMDb katalog verisi yoktur; "bu film gerçekten Netflix'te mi"
sorusu orada **yanıtlanamaz**. Filtre, aday havuzunu toplayan TMDb isteğinin
kendisindedir:

```text
/discover/movie
  watch_region=TR
  with_watch_providers=<ortak kümenin TMDb ID'leri, | ile>
  with_watch_monetization_types=flatrate
```

`flatrate` sınırı bilinçlidir: kiralama ve satın alma "aboneliğe dahil"
değildir ve listeye girmez. Havuz dönen listeden sonradan elenmez — uygun
olmayan film havuza **hiç girmez**.

### Veritabanının uyguladığı kural

Bir tur, hangi ortak kümeyle toplandıysa o küme `space_rounds.provider_keys`
içine yazılır. Geçmişten tekrar aday alınırken (`priority_return` ve
`eligible_repeat` geçişleri) şu alt küme testi uygulanır:

```sql
prior_round.provider_keys <@ p_provider_keys
```

Yani eski turun kümesindeki **her** platform bugün de ortaksa o turun filmleri
tekrar edilebilir. Küme daralırsa (biri aboneliğini bıraktıysa) o filmler
sessizce geri dönemez; hangi platformdan geldikleri bilinmediği için
dışlanırlar. Bu migration'dan önceki turlar `legacy_unknown` taşır ve aynı test
nedeniyle hiçbir zaman tekrar havuzuna giremez.

### Gizlilik sınırı

Partnerin abonelik listesi oda ekranında **görünür**. Bu, gizli oylardan farklı
bir bilgi sınıfıdır: abonelik bir karar değil, ortak zemin arayan bir beyandır
ve kesişim boşsa kullanıcının neyi değiştireceğini bilmesi gerekir. Oylar,
kütüphane ve kabul olayları eskisi gibi paylaşılmaz.

### Beyan güncelleme

`set_participant_subscriptions` yalnızca `auth.uid()` satırını günceller;
partnerin beyanına dokunulamaz. Açık turun adayları değişmez — yeni kesişim bir
sonraki turdan itibaren geçerlidir.

---

## 19. Teleparty köprüsü

WatchMuse bir Teleparty oturumunu üçüncü taraf adına oluşturmaz. İki katılımcı
aynı seçilen film için “Şimdi izlemek istiyorum” dediğinde hostun kurulum alanı
açılır. Host, TMDb'nin Türkiye sağlayıcı sonucuyla ortak aboneliklerin
kesişiminden seçilen Teleparty-destekli gerçek yayın sitesinin aramasını açar.
Film oynatıldıktan sonra Teleparty uzantısında `Start Party` ile `Copy URL`
yapar; WatchMuse odasına dönünce tarayıcı panosu okunur. Otomatik pano izni
verilmezse aynı işlem tek bir “Kopyaladığım bağlantıyı al” düğmesiyle yapılır;
metin alanına yapıştırma gerekmez.

`room_teleparty_sessions` tablosuna doğrudan istemci erişimi yoktur. Yalnızca
`share_room_teleparty_link` RPC'si yazabilir ve şu koşulları birlikte uygular:

- çağıran kullanıcı odanın hostudur,
- oda tam iki katılımcılıdır ve ikisi de süresi dolmamış seçimi kabul etmiştir,
- URL resmi `https://redirect.teleparty.com/join/...` biçimindedir.

`get_space_teleparty_state` kişi bazlı kabul kaydı döndürmez. Çağıran da kabul
etmeden `bothAccepted` açılmaz; ortak hazırlık tamamlanmadan davet URL'si hiçbir
istemciye verilmez. Link yazılınca partnerin terminal tur yoklaması kısa aralığa
geçer ve ekranda doğrudan “Teleparty’ye katıl” düğmesi belirir.

İlgili migration:
`supabase/migrations/20260901000100_teleparty_bridge.sql`.
