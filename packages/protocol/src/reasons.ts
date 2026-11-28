// Punishment reasons to categories, for Player Intelligence. The reason text a moderator typed never leaves the Minecraft
// server: the plugin sorts it into a PunishmentCategory and sends only the category. Intel Cloud uses the same rules for
// public sources (PvPIndex, crawled LiteBans pages), so a reason lands in the same category wherever it was read.
//
// fixtures/punishment-reasons.json is generated from REASON_RULES and shipped in the plugin; the plugin's Java classifier
// and classifyReason below must agree on every case in fixtures/punishment-reason-cases.json.
//
// How a reason is read (normalizeReason, identical in Java):
//   1. the first 512 UTF-16 units; Minecraft colour codes (&a, §l, &#12ab34) removed
//   2. lower case (locale-independent), then ß→ss, ı→i, ł→l, ø→o, æ→ae, œ→oe, đ→d
//   3. Unicode NFKD with all combining marks removed (evasión → evasion, Bannumgehung stays)
//   4. split into tokens at every character that is neither a letter nor a digit
// A reason without tokens is "unknown", and so is one that is exactly a stock text ("Banned by an operator.").
// Otherwise the first rule with a matching term wins; a reason no rule matches is "other".
//
// Term syntax, already in normalized form: words separated by single spaces match consecutive tokens. A word may
// end with * (token starts with it), start with * (ends with it) or both (contains it).
//
// Rule order matters: a compromised account is never cheating ("hacked account"), ban evasion beats the offence it
// evades, and bots beat chat spam ("spam bot").
import type { PunishmentCategory } from "./intel.ts";

export const REASON_RULES_VERSION = 1;

export interface ReasonRules {
  version: number;
  /** Whole reasons (tokens joined by one space) that say nothing: stock texts and placeholders. */
  unknown: string[];
  rules: { category: PunishmentCategory; terms: string[] }[];
}

export const REASON_RULES: ReasonRules = {
  version: REASON_RULES_VERSION,
  unknown: [
    "banned by an operator", "kicked by an operator", "the ban hammer has spoken", "you are banned from this server",
    "you have been banned", "you are banned", "banned", "ban", "kick", "kicked", "mute", "muted", "warn", "warned", "warning",
    "no reason", "no reason given", "no reason specified", "no reason stated", "no reason provided", "reason", "none", "null",
    "n a", "na", "unknown", "unspecified", "undefined", "default", "console", "staff", "admin", "banned by admin",
    "banned by staff", "banned by console", "kein grund", "ohne grund", "kein grund angegeben", "sin razon", "sin motivo",
    "sem motivo", "sem razao", "aucune raison", "sans raison", "brak powodu", "без причины", "sebep yok", "geen reden",
    "nessun motivo",
  ],
  rules: [
    {
      // A hacked or stolen account: the owner is the victim, not a cheater.
      category: "other",
      terms: [
        "compromis*", "kompromittiert*", "hacked account*", "account hacked", "account was hacked", "account got hacked",
        "stolen account*", "account stolen", "account security", "security ban", "gehackte* account*", "account gehackt",
        "account wurde gehackt", "cuenta hackeada", "cuenta robada", "cuenta comprometida", "conta hackeada", "conta roubada",
        "conta invadida", "conta comprometida", "compte pirate", "compte vole", "konto zhakowane", "zhakowane konto",
        "przejete konto", "взломан*", "аккаунт взлом*", "hesap calindi", "calinti hesap",
      ],
    },
    {
      category: "evasion",
      terms: [
        "evasion", "evading", "evade*", "ban evad*", "ban bypass*", "bypass* ban*", "bypassing a ban", "alt", "alts", "alting",
        "alt account*", "altaccount*", "alt acc*", "using an alt", "multi account*", "multiaccount*", "multi accounting",
        "second account*", "*bannumgehung*", "*banumgehung*", "*sperrumgehung*", "*muteumgehung*", "ban umgehung",
        "bann umgehung", "sperr umgehung", "mute umgehung", "umgehung* des bann*", "umgehung* der sperre", "umgehung* einer sperre",
        "ban umgehen", "bann umgehen", "sperre umgehen", "zweitaccount*", "zweit account*", "nebenaccount*",
        "evasion de ban*", "evadir", "evadiendo", "cuenta alternativa", "cuentas alternativas", "multicuenta*", "multi cuenta*",
        "doble cuenta", "evasao", "evasao de ban*", "burlar ban*", "burlando ban*", "conta alternativa", "contas alternativas",
        "multiconta*", "multi conta*", "contournement de ban*", "contournement du ban*", "contournement de sanction*",
        "contourner le ban*", "contourner la sanction*", "double compte", "multicompte*", "multi compte*",
        "compte alternatif", "omijanie bana", "omijanie blokady", "omijanie kary", "multikont*", "multi kont*", "drugie konto", "обход бан*", "обход блокировк*", "твинк*", "мультиакк*",
        "мульти акк*", "ban atlatma", "yan hesap*", "coklu hesap*", "ban ontwijk*", "ontwijken van ban*", "evasione",
        "elusione", "account secondario",
      ],
    },
    {
      category: "bot",
      terms: [
        "bot", "bots", "botting", "botted", "botnet", "bot attack*", "botattack*", "botangriff*", "spambot*", "spam bot*",
        "bot account*", "бот", "боты", "ботов", "бот атака",
      ],
    },
    {
      category: "exploit",
      terms: [
        "exploit*", "bug abus*", "abus* bug*", "abuse of bug*", "abusing a bug", "bug exploit*", "bug using", "bugusing",
        "buguse*", "glitch*", "dupe*", "duping", "duplicat*", "bugausnutzung", "ausnutz* von bug*", "ausnutzen eines bug*",
        "duplizier*", "dupen", "gedupt", "abuso de bug*", "abusar de bug*", "bugear", "bugeo", "dupear", "duplicar",
        "duplicacion", "bugar", "bugando", "duplicacao", "dupar", "abus de bug*", "exploitation de bug*", "duplication",
        "wykorzystywanie bug*", "wykorzystywanie bledow", "bugowanie", "dupowanie", "баг*", "дюп*", "bug kullan*",
        "bug misbruik", "misbruik van bug*", "abuso di bug*", "sfruttamento di bug*",
      ],
    },
    {
      category: "cheating",
      terms: [
        "*cheat*", "hack", "hacks", "hacking", "hacker*", "hackclient*", "hack client*", "hacked client*", "killaura",
        "kill aura", "aura", "forcefield", "fly", "flying", "flyhack*", "fly hack*", "speedhack*", "speed hack*", "reach",
        "autoclick*", "auto click*", "clicker", "macro", "macros", "macroing", "xray", "x ray", "esp", "bhop", "bunnyhop",
        "scaffold*", "nofall", "no fall", "antikb", "anti kb", "antiknockback", "anti knockback", "no knockback",
        "triggerbot*", "aimbot*", "aim assist", "aimassist", "autototem", "auto totem", "freecam", "baritone", "wurst",
        "meteor client", "liquidbounce", "vape", "impact client", "nuker", "fastplace", "fast place", "fastbreak",
        "fast break", "autoarmor", "auto armor", "cheststealer", "chest stealer", "timer", "combat hack*", "movement hack*",
        "unfair advantage*", "unfair client*", "illegal mod*", "illegal client*", "illegal modification*", "illegal software",
        "disallowed mod*", "disallowed client*", "disallowed modification*", "unallowed mod*", "unallowed client*",
        "unauthori* mod*", "unauthori* client*", "blacklisted mod*", "blacklisted client*", "blacklisted modification*",
        "client modification*", "modified client*", "third party software", "grimac", "hacken", "unerlaubte* mod*",
        "unerlaubte* client*", "unerlaubte* modifikation*", "unerlaubte* software", "verbotene* mod*", "verbotene* client*",
        "clientmodifikation*", "trampa*", "hackear", "hackeando", "mods ilegales", "mod ilegal", "cliente modificado",
        "cliente ilegal", "programas externos", "programa externo", "trapac*", "mods ilegais", "cliente ilegal",
        "programa ilegal", "programas ilegais", "vantagem injusta", "trich*", "client modifie", "client illegal",
        "mods interdits", "mod interdit", "modifications interdites", "avantage deloyal", "czit*", "oszukiwanie",
        "nielegalne modyfikacje", "niedozwolone modyfikacje", "nielegalny klient", "niedozwolony klient", "чит*",
        "сторонн* софт*", "запрещен* софт*", "запрещен* мод*", "запрещен* клиент*", "хак*", "hile*", "yasak mod*",
        "yasakli mod*", "valsspel*", "vals spel*", "ongeoorloofde mod*", "illegale mod*", "imbrogli*", "trucchi",
        "mod non consentit*", "mod illegal*", "client modificato", "podvad*", "nepovolene modifikace",
      ],
    },
    {
      category: "scam",
      terms: [
        "scam*", "fraud*", "chargeback*", "charge back*", "charged back", "paypal dispute", "payment dispute", "refund abuse",
        "phish*", "real money trading", "rmt", "irl trading", "irl trade*", "selling account*", "account selling",
        "stealing account*", "account theft", "betrug*", "ruckbuchung*", "rucklastschrift*", "echtgeld*", "estafa*", "estafar",
        "fraude*", "contracargo*", "golpe*", "golpista*", "estorno*", "arnaque*", "escroquerie*", "retrofacturation",
        "oszust*", "wyludzen*", "мошенни*", "скам*", "обман*", "dolandir*", "oplicht*", "truffa*", "frode*",
      ],
    },
    {
      category: "harassment",
      terms: [
        "harass*", "threat*", "dox*", "ddos*", "dos attack*", "swatting", "bully*", "cyberbully*", "stalk*", "racis*",
        "homophob*", "transphob*", "sexis*", "discriminat*", "hate speech", "nazi*", "hitler", "slur*", "grooming",
        "belastig*", "bedroh*", "drohung*", "rassis*", "diskriminier*", "mobbing", "volksverhetzung", "acoso", "acosar", "amenaza*",
        "discrimina*", "assedio", "ameaca*", "harcelement", "harceler", "menace*", "nekanie", "grozb*", "rasizm", "rasist*",
        "dyskrymin*", "угроз*", "травл*", "расизм*", "расист*", "деанон*", "ддос*", "taciz*", "tehdit*", "irkcilik",
        "intimidatie", "bedreig*", "molestie", "minacce", "minaccia", "razzis*",
      ],
    },
    {
      category: "griefing",
      terms: [
        "grief*", "greif*", "griefed", "vandal*", "destroy* build*", "destroying base*", "base destruction", "stealing",
        "zerstor*", "klauen", "diebstahl", "grifear", "destruir", "destruccion", "robar", "robo", "destruicao", "roubo",
        "roubar", "destruction", "detruire", "niszczenie", "kradziez", "гриф*", "разрушен*",
      ],
    },
    {
      category: "chat",
      terms: [
        "spam*", "advertis*", "advert*", "ads", "self promotion", "promotion", "toxic*", "insult*", "swear*", "cursing",
        "profanity", "offensive language", "inappropriate language", "bad language", "inappropriate chat", "chat*",
        "flood*", "caps", "excessive caps", "disrespect*", "rude*", "troll*", "language", "provocation", "provoking",
        "begging", "*werbung", "beleidig*", "toxisch*", "provokation*", "provozier*", "respektlos*", "fluchen", "vulgar*",
        "unangemessene sprache", "ausdrucksweise", "publicidad", "lenguaje ofensivo", "lenguaje inapropiado",
        "falta de respeto", "faltas de respeto", "irrespetuos*", "groseri*", "mayusculas", "divulga*", "propaganda",
        "xingamento*", "xingar", "ofens*", "linguagem ofensiva", "desrespeito*", "palavrao", "palavroes", "publicite*",
        "pub", "langage*", "irrespect*", "manque de respect", "reklam*", "obrazanie", "obrazliw*", "wyzwisk*", "przeklin*",
        "toksycz*", "спам*", "реклам*", "оскорб*", "мат", "флуд*", "токсич*", "капс*", "kufur*", "hakaret*", "toksik*",
        "reclame", "scheld*", "pubblicita", "linguaggio", "bestemmi*", "tossic*",
      ],
    },
  ],
};

const COLOUR = /[&§](?:#[0-9a-f]{6}|[0-9a-fk-orx])/gi;
const FOLD: Record<string, string> = { "ß": "ss", "ı": "i", "ł": "l", "ø": "o", "æ": "ae", "œ": "oe", "đ": "d" };

/** The tokens of a reason, as both classifiers read it. */
export function normalizeReason(text: string): string[] {
  const lower = text.slice(0, 512).replace(COLOUR, " ").toLowerCase().replace(/[ßıłøæœđ]/g, (c) => FOLD[c]!);
  return lower.normalize("NFKD").replace(/\p{M}+/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

type Part = { text: string; prefix: boolean; suffix: boolean };
const compiled = new WeakMap<ReasonRules, { unknown: Set<string>; rules: { category: PunishmentCategory; terms: Part[][] }[] }>();

function parse(word: string): Part {
  const prefix = word.endsWith("*"), suffix = word.startsWith("*");
  return { text: word.replace(/^\*|\*$/g, ""), prefix, suffix };
}
function partMatches(token: string, part: Part): boolean {
  if (part.prefix && part.suffix) return token.includes(part.text);
  if (part.prefix) return token.startsWith(part.text);
  if (part.suffix) return token.endsWith(part.text);
  return token === part.text;
}
function termMatches(tokens: string[], term: Part[]): boolean {
  for (let i = 0; i + term.length <= tokens.length; i++) {
    let all = true;
    for (let j = 0; j < term.length && all; j++) all = partMatches(tokens[i + j]!, term[j]!);
    if (all) return true;
  }
  return false;
}

/** The category of a punishment reason; null, empty and stock reasons are "unknown", unmatched ones "other". */
export function classifyReason(text: string | null | undefined, rules: ReasonRules = REASON_RULES): PunishmentCategory {
  if (text === null || text === undefined) return "unknown";
  const tokens = normalizeReason(text);
  if (tokens.length === 0) return "unknown";
  let c = compiled.get(rules);
  if (!c) {
    c = { unknown: new Set(rules.unknown), rules: rules.rules.map((r) => ({ category: r.category, terms: r.terms.map((t) => t.split(" ").map(parse)) })) };
    compiled.set(rules, c);
  }
  if (c.unknown.has(tokens.join(" "))) return "unknown";
  for (const rule of c.rules) for (const term of rule.terms) if (termMatches(tokens, term)) return rule.category;
  return "other";
}
