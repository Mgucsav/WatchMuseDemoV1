import "server-only";

import { isLocalRoomsEnabled } from "@/lib/supabase/env";

/**
 * Oda verisinin hangi arka uçtan geleceğine karar veren TEK yer.
 *
 * NEDEN TEK YER: bu karar `createRoom`, `joinRoom`, `getRoomState` ve ileride
 * eklenecek her özellik (aday film havuzu, oylama, rulet, izlenenler listesi,
 * kişisel puanlar) tarafından tekrar sorulacak. Koşulun kopyalanması, iki
 * kopyanın zamanla birbirinden ayrılması riskini doğurur.
 *
 * Ayrıca tarayıcı tarafı `isLocalRoomsEnabled()` ile AYNI mantığı kullanır;
 * böylece istemci anonim Supabase oturumu açmaya çalışırken sunucunun yerel
 * depoyu kullanması gibi bir uyumsuzluk oluşamaz.
 *
 * Yerel mod yalnızca geliştirme/demo içindir: veri süreç belleğindedir ve
 * sunucu yeniden başlatıldığında kaybolur.
 */
export function isLocalRoomsBackend(): boolean {
  // Sunucuya özel bayrak, herkese açık bayraktan bağımsız olarak da çalışsın.
  if (process.env.USE_LOCAL_ROOMS === "true") return true;

  return isLocalRoomsEnabled();
}
