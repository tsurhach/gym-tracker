// English strings (the fallback for every other language), one file per area under ./en/.
// Flat keys, whole sentences, {name} placeholders. Plural value: { one, other }.
// Gendered variants of a key are "key.m" / "key.f" (only in he.js, only for the strings listed in `addressesUser`).
import common, { addressesUser as a1 } from "./en/common.js";
import train, { addressesUser as a2 } from "./en/train.js";
import plan, { addressesUser as a3 } from "./en/plan.js";
import social, { addressesUser as a4 } from "./en/social.js";
import extra from "./en/extra.js";

export const addressesUser = [...a1, ...a2, ...a3, ...a4];
export default { ...common, ...train, ...plan, ...social, ...extra,
  "settings.wording": "Wording",
  "settings.gender.neutral": "Neutral",
  "settings.gender.male": "Male",
  "settings.gender.female": "Female",
  "settings.lang.auto": "Auto (phone)",
};
