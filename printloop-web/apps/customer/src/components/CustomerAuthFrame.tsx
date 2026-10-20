import type { ReactNode } from "react";
import { AuthFrame, Wordmark } from "@printloop/ui";
import { getShop } from "@/lib/shop";

export async function CustomerAuthFrame({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
}) {
  const shop = await getShop();
  const brand = shop ? (
    <span className="flex items-center gap-3">
      {shop.branding?.logoUrl ? (
        <img src={shop.branding.logoUrl} alt="" className="h-8 w-8 object-contain border-2 border-ink bg-white" />
      ) : (
        <span className="h-8 w-8 grid place-items-center border-2 border-ink bg-brand text-paper font-serif font-bold">
          {shop.name.charAt(0)}
        </span>
      )}
      <span className="font-serif font-extrabold text-xl tracking-tight">{shop.name}</span>
      <span className="editorial-label text-ink/40 hidden sm:inline">on PrintLoop</span>
    </span>
  ) : (
    <Wordmark />
  );
  return (
    <AuthFrame kicker={kicker} title={title} lede={lede} brand={brand}>
      {children}
    </AuthFrame>
  );
}
