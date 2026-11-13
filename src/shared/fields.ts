// Field names (DEC-071), shared by the server (which enforces them) and the screens (which hint).

/** The naming convention: spaces tidied, first letter a capital, the rest as typed ("ID" stays "ID"). */
export const fieldName = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
};

/** A name with only its letters and digits, lower case: "O.D.", "od" and "OD " are one name. */
export const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
