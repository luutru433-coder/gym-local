export type NutritionPackSearchQueries = {
  /** Every word must appear, as a prefix, in the names or aliases. */
  match: string;
  /** A display name begins with the words in the order typed. */
  nameStart: string;
  /** A display name contains the words in the order typed. */
  namePhrase: string;
};

/**
 * Builds the FTS5 expressions for one food search. Results are ranked by how
 * closely a display name follows what was typed, so "thit ga" lists foods
 * named "Thịt gà…" before foods that only mention both words somewhere.
 */
export function nutritionPackSearchQueries(query: string): NutritionPackSearchQueries | null {
  const tokens = query
    .normalize("NFC")
    .replace(/["'():*^{}[\]+]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return null;
  const phrases = dStrokeSpellings(tokens).map((spelling) => `${spelling.map((token) => `"${token}"`).join(" + ")} *`);
  return {
    match: tokens.map((token) => `"${token}"*`).join(" "),
    // The outer brackets keep the column filter on every spelling, not only the first.
    nameStart: `{name_vi name_en} : (${phrases.map((phrase) => `(^ ${phrase})`).join(" OR ")})`,
    namePhrase: `{name_vi name_en} : (${phrases.map((phrase) => `(${phrase})`).join(" OR ")})`
  };
}

const MAX_D_STROKE_WORDS = 3;

/**
 * The tokenizer folds Vietnamese tone and vowel marks but not "đ", so a name
 * column never matches "dau" against "đậu". Unaccented typing is covered by
 * also trying "đ" for each word that starts with "d".
 */
function dStrokeSpellings(tokens: string[]): string[][] {
  const positions = tokens.flatMap((token, index) => (/^d/i.test(token) ? [index] : [])).slice(0, MAX_D_STROKE_WORDS);
  return Array.from({ length: 2 ** positions.length }, (_, mask) =>
    tokens.map((token, index) => {
      const bit = positions.indexOf(index);
      return bit >= 0 && mask & (1 << bit) ? `đ${token.slice(1)}` : token;
    })
  );
}
