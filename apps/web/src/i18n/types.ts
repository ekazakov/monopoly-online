/** The plural forms of English: one and other. */
export interface Plural {
  one: string;
  other: string;
}

/** The plural forms that Russian needs (`Intl.PluralRules("ru")`): 1, 2 to 4, 5 to 20, and fractions. */
export interface RussianPlural extends Plural {
  few: string;
  many: string;
}

export type Message = string | Plural;
export type Messages = Record<string, Message>;

/**
 * A catalogue with the same keys as `Source`. A plain text stays a text, and a plural takes the
 * forms `P`. A missing or an extra key fails the type check.
 */
export type Catalogue<Source extends Messages, P extends Plural = Plural> = {
  [K in keyof Source]: Source[K] extends string ? string : P;
};
