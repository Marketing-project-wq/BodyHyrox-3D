import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, getDict, type Locale, type Dict } from "./i18n";

export function getLocale(): Locale {
  // A saved manual choice always wins.
  const v = cookies().get(LOCALE_COOKIE)?.value;
  if (v === "id" || v === "en") return v;
  // First visit (no choice yet): detect from the browser's Accept-Language.
  const al = headers().get("accept-language")?.toLowerCase() ?? "";
  const first = al.split(",")[0]?.trim() ?? "";
  if (first.startsWith("id")) return "id";
  return DEFAULT_LOCALE; // fallback: en
}

export function getMessages(): Dict {
  return getDict(getLocale());
}
