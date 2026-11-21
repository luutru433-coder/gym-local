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
  const phrase = `${tokens.map((token) => `"${token}"`).join(" + ")} *`;
  return {
    match: tokens.map((token) => `"${token}"*`).join(" "),
    nameStart: `{name_vi name_en} : ^ ${phrase}`,
    namePhrase: `{name_vi name_en} : ${phrase}`
  };
}
