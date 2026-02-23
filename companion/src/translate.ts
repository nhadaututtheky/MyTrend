// Shared translation utilities — used by both REST API and Telegram bridge

/** Vietnamese diacritical marks (Unicode ranges for ă, đ, ĩ, ũ, ơ, ư, and combined marks) */
const VI_DIACRITICS =
  /[\u0102-\u0103\u0110-\u0111\u0128-\u0129\u0168-\u0169\u01A0-\u01B0\u1EA0-\u1EF9]/;

/** Detect if text contains Vietnamese characters. */
export function isVietnamese(text: string): boolean {
  return VI_DIACRITICS.test(text);
}

/** Translate text via Google Translate API (free gtx endpoint). */
export async function translateText(
  text: string,
  from = "vi",
  to = "en"
): Promise<{ translated: string; error?: string }> {
  if (!text.trim()) return { translated: "" };

  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", from);
    url.searchParams.set("tl", to);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { translated: "", error: `Google API ${res.status}` };
    }

    const result = (await res.json()) as [string, unknown][][] | null;
    const translated =
      result?.[0]?.map((seg) => seg[0]).join("") ?? "";
    return { translated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Translation failed";
    return { translated: "", error: msg };
  }
}
