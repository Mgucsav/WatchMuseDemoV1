# WatchMuse — Oda ve Katılımcı Mimarisi

Bu belge, iki kişilik özel oda temelinin (spaces / participants / invitations)
güven sınırlarını, davet akışını ve güvenlik varsayımlarını açıklar.

**Kapsam:** yalnızca kalıcı oda ve katılımcı temeli. Film havuzu, oylama,
eşleştirme, rulet, izleme sonrası puanlama ve öneri mantığı **bu aşamada
uygulanmamıştır**.

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
│  src/proxy.ts               ← oturum tazeleme                        │
│                                                                      │
│  ★ Düz metin token bu katmanın DIŞINA yalnızca davet bağlantısı      │
│    olarak çıkar. Veritabanına asla gönderilmez.                      │
│  ★ service_role anahtarı HİÇBİR YERDE kullanılmaz.                   │
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
3. `service_role` anahtarı **alınmaz ve hiçbir yere yazılmaz**.
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

## 11. Entegrasyon testi ile doğrulanması gerekenler

Aşağıdakiler **kod incelemesiyle tasarlanmış ancak çalıştırılarak
doğrulanmamıştır**. Supabase CLI + Docker kurulduğunda test edilmelidir:

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
