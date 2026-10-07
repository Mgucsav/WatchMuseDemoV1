/**
 * WatchMuse logosu: makara delikli bir film karesi içinde "W".
 *
 * İşaret `currentColor` ile çizilir; rengi çevresindeki metinden alır ve
 * açık/koyu temaya kendiliğinden uyar. Sekme simgesi aynı çizimin
 * `src/app/icon.svg` içindeki kopyasıdır.
 */
const SPROCKET_X = [9.5, 16, 22.5, 29, 35.5];
const SPROCKET_Y = [10.5, 34.5];

export function LogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="4.5" y="6.5" width="39" height="35" rx="5" strokeWidth="3" />
      {SPROCKET_Y.flatMap((y) =>
        SPROCKET_X.map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="3"
            height="3"
            rx="0.6"
            fill="currentColor"
            stroke="none"
          />
        )),
      )}
      <polyline
        points="12.5,18 17.5,31 24,21.5 30.5,31 35.5,18"
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** İşaret ve "WatchMuse" yazısı yan yana. Yazı boyutu ve aralık `className` ile verilir. */
export function Logo({
  markSize = 24,
  className = "gap-2 text-base",
}: {
  markSize?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center font-bold tracking-tight ${className}`}>
      <LogoMark size={markSize} className="shrink-0" />
      <span>WatchMuse</span>
    </span>
  );
}
