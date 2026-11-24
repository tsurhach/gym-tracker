// Hebrew strings, one file per area under ./he/ (same keys as en.js). "key.m" / "key.f" = male / female variants (neutral key is the default).
// Plural value: { one, two, other }. Tone: neutral wording (infinitives, impersonal); see docs/hebrew notes.
import common from "./he/common.js";
import train from "./he/train.js";
import plan from "./he/plan.js";
import social from "./he/social.js";

export default { ...common, ...train, ...plan, ...social,
  "settings.wording": "ניסוח",
  "settings.gender.neutral": "ניטרלי",
  "settings.gender.male": "זכר",
  "settings.gender.female": "נקבה",
  "settings.lang.auto": "אוטומטי (לפי הטלפון)",
};
