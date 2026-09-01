import { InviteRedeemer } from "@/components/rooms/InviteRedeemer";

export const metadata = {
  title: "WatchMuse — Davet",
  // Davet sayfası hiçbir koşulda dizine eklenmemelidir.
  robots: { index: false, follow: false },
};

/**
 * Davet tüketme sayfası.
 *
 * REFERRER SIZINTISI NOTU: bu sayfa token'ı yol segmentinde taşır. Sızıntıyı
 * azaltmak için:
 *   * `next.config.ts` bu yol için `Referrer-Policy: no-referrer` gönderir,
 *   * sayfa üçüncü taraf kaynak YÜKLEMEZ (uygulama fontları `next/font` ile
 *     derleme sırasında indirilip kendi alan adımızdan sunulur; çalışma
 *     zamanında Google Fonts'a istek gitmez),
 *   * token tüketildikten sonra token içermeyen adrese `replace` ile geçilir.
 *
 * Davet, sayfa açılır açılmaz TÜKETİLMEZ: kullanıcı önce aboneliklerini
 * bildirir (bkz. `InviteRedeemer`). Tek kullanımlık bir davetin beyansız
 * harcanması, ortak kümesi boş bir odaya yol açardı.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Odaya katıl</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Önce hangi aboneliklere sahip olduğunuzu seçin. Film önerileri,
            sizin ve odayı kuran kişinin ortak platformlarından gelecek.
          </p>
        </header>

        <InviteRedeemer token={token} />
      </div>
    </main>
  );
}
