import { getBrands } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getMessages } from "@/lib/i18n-server";
import { BrandsClient } from "@/components/BrandsClient";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const [brands, session] = await Promise.all([getBrands(), getSession()]);
  return (
    <BrandsClient
      brands={brands}
      canEdit={can(session?.role, "brand.edit")}
      canToggle={can(session?.role, "brand.toggle")}
      m={getMessages()}
    />
  );
}
