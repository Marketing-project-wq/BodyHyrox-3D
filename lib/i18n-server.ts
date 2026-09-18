import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, getDict, type Locale, type Dict } from "./i18n";

export function getLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return v === "id" ? "id" : DEFAULT_LOCALE;
}

export function getMessages(): Dict {
  return getDict(getLocale());
}
