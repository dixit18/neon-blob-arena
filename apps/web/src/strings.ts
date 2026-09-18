// apps/web/src/strings.ts — GB-4: every landing-shell word in one table.
// English + Hindi (Devanagari). Game clients keep English for now (open
// follow-up in TICKETS); saga/game content (names, hooks, chapters) is
// content, not chrome, and rides a later content pipeline.
// Usage: t('play.label') / t('play.entering', { id }). Missing Hindi falls
// back to English; missing keys echo the key (loud in tests, quiet in UI).
export type Lang = 'en' | 'hi';

type Table = Record<string, string>;

const en: Table = {
  'meta.title': 'Playground — poke something',
  'kicker.live': 'NO SIGNUP · LINK = ROOM · BOTS NEVER SLEEP',
  'hero.a': "DON'T BROWSE.",
  'hero.b': 'POKE SOMETHING.',
  'hero.sub': 'Zoom through the saga — every chapter ends in a game. Or hit PLAY for the chapter you face.',
  'play.label': '▶ PLAY',
  'play.diving': 'diving…',
  'play.steer': 'steer toward a glowing ring…',
  'play.excavated': 'that world is still being excavated.',
  'play.divingIn': 'diving in — see you inside!',
  'play.entering': 'entering {id}…',
  'play.waking': 'server is waking up — PLAY retries automatically.',
  'play.wakingRetry': 'server is still waking — wait a few seconds, hit PLAY again.',
  'play.roomJoining': 'room {room} · joining as {name}…',
  'play.roomPlaying': 'room {room} · playing as {name}',
  'play.roomFallback': 'room {room} · game client lands in its sprint — server rooms are live now.',
  'play.mountFallback': 'this game is still being excavated. try another portal.',
  'moods.beat': '⚔️ BEAT',
  'moods.chaos': '🎪 CHAOS',
  'moods.think': '🧠 THINK',
  'moods.surprise': '🎲 SURPRISE ME',
  'moodline.beat': 'beat weather — fast rings, faster friends.',
  'moodline.chaos': 'chaos weather — everything sparkles at once.',
  'moodline.think': 'think weather — slow water, deep dive.',
  'moodline.surprise': 'surprise weather — the rift chooses for you.',
  'rift.copy': 'copy my world link',
  'rift.sharePrompt': 'Share this world:',
  'room.kicker': 'ROOM',
  'room.entering': 'Entering…',
  'room.resolving': 'resolving room…',
  'room.back': '← back to the playground',
  'room.mountDefault': 'game client mounts here',
  'finale.aria': 'Saga finale',
  'finale.share': '⚔ CHALLENGE A FRIEND',
  'finale.dive': 'keep diving',
  'finale.copied': 'challenge link copied — send it!',
  'finale.prompt': 'Challenge a friend:',
  'finale.shareText': '{title} — read it before Season 2. {link}',
  'saga.tabsAria': 'Choose a saga',
  'dive.hint': 'scroll / drag to dive · tap to enter',
  'dive.hintStill': 'tap to enter',
  'dive.steer': '✈ steer to fly — dive INTO a glowing ring to play · tap works too',
  'dive.photo': '📸 vista',
  'dive.photoAria': 'Capture this vista as a shareable image',
  'dive.saved': 'vista saved + invite link copied 📸',
  'dive.blocked': 'vista blocked by the browser — screenshot it!',
  'dive.invite': 'I found {name} — come poke it: {link}',
  'dive.aria': 'Endless story dive through six saga chapters. Scroll to turn the page, tap a glowing ring to play.',
  'lang.toggle': 'हिंदी में देखें',
  'studio.failed': 'studio failed to load.',
};

const hi: Table = {
  'meta.title': 'Playground — कुछ छेड़ो',
  'kicker.live': 'बिना साइनअप · लिंक = रूम · बॉट कभी सोते नहीं',
  'hero.a': 'देखते मत रहो।',
  'hero.b': 'कुछ छेड़ो।',
  'hero.sub': 'सागा में ज़ूम करो — हर अध्याय एक खेल पर खत्म होता है। या सामने वाले अध्याय के लिए PLAY दबाओ।',
  'play.label': '▶ खेलो',
  'play.diving': 'गोता लग रहा…',
  'play.steer': 'चमकती रिंग की ओर बढ़ो…',
  'play.excavated': 'यह दुनिया अभी बन रही है।',
  'play.divingIn': 'अंदर जा रहे — मिलते हैं!',
  'play.entering': '{id} में प्रवेश…',
  'play.waking': 'सर्वर जाग रहा — PLAY खुद दोबारा कोशिश करेगा।',
  'play.wakingRetry': 'सर्वर अभी जाग रहा — कुछ सेकंड रुको, फिर PLAY दबाओ।',
  'play.roomJoining': 'रूम {room} · {name} बनकर जुड़ रहे…',
  'play.roomPlaying': 'रूम {room} · {name} खेल रहे',
  'play.roomFallback': 'रूम {room} · गेम क्लाइंट अपने स्प्रिंट में आएगा — सर्वर रूम लाइव हैं।',
  'play.mountFallback': 'यह गेम अभी बन रहा है। दूसरा पोर्टल आज़माओ।',
  'moods.beat': '⚔️ जोश',
  'moods.chaos': '🎪 धमाल',
  'moods.think': '🧠 सोच',
  'moods.surprise': '🎲 सरप्राइज़',
  'moodline.beat': 'जोश वाला मौसम — तेज़ रिंग, तेज़ दोस्त।',
  'moodline.chaos': 'धमाल मौसम — सब कुछ एक साथ चमकता है।',
  'moodline.think': 'सोच वाला मौसम — धीमा पानी, गहरा गोता।',
  'moodline.surprise': 'सरप्राइज़ मौसम — रिफ्ट खुद चुनेगा।',
  'rift.copy': 'मेरी दुनिया का लिंक कॉपी करो',
  'rift.sharePrompt': 'यह दुनिया साझा करो:',
  'room.kicker': 'रूम',
  'room.entering': 'प्रवेश हो रहा…',
  'room.resolving': 'रूम सुलझ रहा…',
  'room.back': '← खेल के मैदान पर वापस',
  'room.mountDefault': 'गेम क्लाइंट यहाँ लगेगा',
  'finale.aria': 'सागा समापन',
  'finale.share': '⚔ दोस्त को चुनौती दो',
  'finale.dive': 'गोता जारी रखो',
  'finale.copied': 'चुनौती लिंक कॉपी हुआ — भेज दो!',
  'finale.prompt': 'दोस्त को चुनौती दो:',
  'finale.shareText': '{title} — सीज़न 2 से पहले पढ़ लो। {link}',
  'saga.tabsAria': 'सागा चुनें',
  'dive.hint': 'स्क्रॉल / ड्रैग से गोता · प्रवेश के लिए टैप',
  'dive.hintStill': 'प्रवेश के लिए टैप',
  'dive.steer': '✈ उड़ने के लिए घुमाओ — खेलने के लिए चमकती रिंग में गोता लगाओ · टैप भी चलता है',
  'dive.photo': '📸 नज़ारा',
  'dive.photoAria': 'इस नज़ारे को साझा इमेज बनाकर कैप्चर करो',
  'dive.saved': 'नज़ारा सहेजा + न्योता लिंक कॉपी हुआ 📸',
  'dive.blocked': 'ब्राउज़र ने नज़ारा रोका — स्क्रीनशॉट ले लो!',
  'dive.invite': 'मुझे {name} मिला — आकर छेड़ो: {link}',
  'dive.aria': 'छह सागा अध्यायों में अंतहीन कहानी-गोता। पन्ना पलटने के लिए स्क्रॉल करो, खेलने के लिए चमकती रिंग टैप करो।',
  'lang.toggle': 'View in English',
  'studio.failed': 'स्टूडियो लोड नहीं हुआ।',
};

let lang: Lang = 'en';
try {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('pg-lang') : null;
  if (saved === 'hi' || saved === 'en') lang = saved;
} catch { /* private mode speaks English */ }

export function getLang(): Lang { return lang; }

export function setLang(l: Lang): void {
  lang = l;
  try { localStorage.setItem('pg-lang', l); } catch { /* private */ }
}

function fill(s: string, vars?: Record<string, string>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Translate a shell key. Game ids/verbs/hooks are content — never keys. */
export function t(key: string, vars?: Record<string, string>): string {
  const table = lang === 'hi' ? hi : en;
  const s = table[key] ?? en[key] ?? key;
  return fill(s, vars);
}

/** Test seam: every English key and its placeholders. */
export function enKeys(): string[] { return Object.keys(en); }
/** Exported for tests only (same objects, zero bundle cost). */
export const EN_TABLE: Table = en;
export const HI_TABLE: Table = hi;
export function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}
