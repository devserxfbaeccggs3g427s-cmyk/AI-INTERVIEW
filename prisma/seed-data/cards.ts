/**
 * Seed 140 thẻ ngoại ngữ — 70 zh (level `zero`) + 70 en (level `A1`).
 *
 * Nguồn: `system-design/SPEC.md` Phụ lục B + `.kiro/steering/user-profile-decisions.md` §4.3.
 *
 * Q3: Tiếng Trung = `zero` (chưa biết gì, luôn có pinyin) · Tiếng Anh = `A1`
 * nhưng **rút gọn về "vài từ cơ bản"**: pronouns, số 1–10, ngày trong tuần,
 * lời chào, và các mẫu `I am / My name is / I like / I want`.
 *
 * ⚠️ `id` CỐ ĐỊNH theo slug (không `cuid()`) để `npm run db:reset` cho ra
 * DB giống hệt nhau (NFR-AF-07).
 */

export interface SeedCard {
  id: string;
  lang: "zh" | "en";
  front: string;
  frontAlt?: string;
  back: string;
  example?: string;
  examplePinyin?: string;
  group: string;
  mode: "recognize" | "recall" | "produce";
}

const ZH_GROUPS = [
  { group: "greet", label: "Chào hỏi" },
  { group: "people", label: "Người & thân xã" },
  { group: "food", label: "Đồ ăn" },
  { group: "place", label: "Địa điểm" },
  { group: "time", label: "Thời gian" },
  { group: "verb", label: "Động từ & phó từ" },
] as const;

const EN_GROUPS = [
  { group: "pronoun", label: "Pronouns & cơ bản" },
  { group: "number", label: "Numbers" },
  { group: "family", label: "Family" },
  { group: "day", label: "Days of week" },
  { group: "greet", label: "Greetings" },
  { group: "verb", label: "Động từ cơ bản" },
] as const;

/* ══ Tiếng Trung — 6 nhóm × 10 từ ═════════════════════════════════════════ */

const ZH_WORDS: Array<[string, string, string, string]> = [
  // [hanzi, pinyin, nghĩa, ví dụ]
  ["你好", "nǐ hǎo", "xin chào", "你好，我叫明。"],
  ["谢谢", "xièxie", "cảm ơn", "谢谢你的帮助。"],
  ["再见", "zàijiàn", "tạm biệt", "再见，明天见。"],
  ["对不起", "duìbuqǐ", "xin lỗi", "对不起，我不是故意的。"],
  ["没关系", "méiguānxi", "không sao", "没关系，下次注意。"],
  ["请", "qǐng", "làm ơn", "请坐。"],
  ["早上好", "zǎoshanghǎo", "chào buổi sáng", "早上好，今天天气很好。"],
  ["晚上好", "wǎnshanghǎo", "chào buổi tối", "晚上好，吃过了吗？"],
  ["你好吗", "nǐ hǎo ma", "bạn khỏe không", "你好吗？最近怎么样？"],
  ["很高兴认识你", "hěn gāoxìng rènshi nǐ", "rất vui gặp bạn", "很高兴认识你！"],

  ["我", "wǒ", "tôi", "我是学生。"],
  ["你", "nǐ", "bạn", "你叫什么名字？"],
  ["他", "tā", "anh ấy", "他是老师。"],
  ["她", "tā", "cô ấy", "她会说中文。"],
  ["我们", "wǒmen", "chúng tôi", "我们一起学习。"],
  ["爸爸", "bàba", "bố", "我爸爸是工程师。"],
  ["妈妈", "māma", "mẹ", "我妈妈做饭很好吃。"],
  ["哥哥", "gēge", "anh trai", "我哥哥在上海工作。"],
  ["弟弟", "dìdi", "em trai", "我弟弟还在上学。"],
  ["朋友", "péngyou", "bạn bè", "他是我最好的朋友。"],

  ["水", "shuǐ", "nước", "我要一杯水。"],
  ["茶", "chá", "trà", "我喜欢喝茶。"],
  ["米饭", "mǐfàn", "cơm", "我们吃米饭吧。"],
  ["面条", "miàntiáo", "mì", "我爱吃面条。"],
  ["肉", "ròu", "thịt", "这个肉很新鲜。"],
  ["鱼", "yú", "cá", "鱼是健康的食物。"],
  ["菜", "cài", "rau", "多吃菜对身体好。"],
  ["苹果", "píngguǒ", "táo", "我每天早上吃一个苹果。"],
  ["牛奶", "niúnǎi", "sữa", "睡觉前喝牛奶。"],
  ["好吃", "hǎochī", "ngon", "这个菜真好吃。"],

  ["家", "jiā", "nhà", "我的家很大。"],
  ["学校", "xuéxiào", "trường học", "我去学校学习中文。"],
  ["公司", "gōngsī", "công ty", "我在公司写代码。"],
  ["中国", "Zhōngguó", "Trung Quốc", "我想去中国旅行。"],
  ["医院", "yīyuàn", "bệnh viện", "他今天在医院。"],
  ["商店", "shāngdiàn", "cửa hàng", "商店八点关门。"],
  ["车站", "chēzhàn", "nhà ga", "我们在车站见面。"],
  ["房间", "fángjiān", "phòng", "我的房间很干净。"],
  ["公园", "gōngyuán", "công viên", "晚上去公园散步。"],
  ["中国人", "Zhōngguó rén", "người Trung Quốc", "他是中国人。"],

  ["今天", "jīntiān", "hôm nay", "今天天气很好。"],
  ["明天", "míngtiān", "ngày mai", "明天我们开会。"],
  ["昨天", "zuótiān", "hôm qua", "昨天我加班了。"],
  ["早上", "zǎoshang", "buổi sáng", "我早上六点起床。"],
  ["中午", "zhōngwǔ", "trưa", "中午我们一起吃饭。"],
  ["晚上", "wǎnshang", "buổi tối", "晚上我学习中文。"],
  ["现在", "xiànzài", "bây giờ", "现在几点了？"],
  ["一点", "yī diǎn", "một giờ", "现在一点了。"],
  ["星期", "xīngqī", "tuần", "今天是星期一。"],
  ["年", "nián", "năm", "今年是2026年。"],

  ["是", "shì", "là", "我是Java工程师。"],
  ["不", "bù", "không", "我不明白。"],
  ["有", "yǒu", "có", "我有一个问题。"],
  ["吃", "chī", "ăn", "我们吃面条吧。"],
  ["喝", "hē", "uống", "我想喝茶。"],
  ["学", "xué", "học", "我学中文和英语。"],
  ["工作", "gōngzuò", "làm việc", "我在银行工作。"],
  ["去", "qù", "đi", "我明天去公司。"],
  ["来", "lái", "tới", "你什么时候来？"],
  ["很", "hěn", "rất", "他很聪明。"],
];

/* ══ Tiếng Trung — 10 mẫu câu ══════════════════════════════════════════════ */

const ZH_PATTERNS: Array<[string, string, string, string]> = [
  ["你好，我是……", "nǐ hǎo, wǒ shì …", "xin chào, tôi là …", "你好，我是明。"],
  ["这是……", "zhè shì …", "đây là …", "这是我的同事。"],
  ["我要……", "wǒ yào …", "tôi muốn …", "我要一杯咖啡。"],
  ["我喜欢……", "wǒ xǐhuan …", "tôi thích …", "我喜欢打篮球。"],
  ["我不会……", "wǒ bù huì …", "tôi không biết …", "我不会说日语。"],
  ["……在哪里？", "… zài nǎ lǐ?", "… ở đâu?", "洗手间在哪里？"],
  ["……多少钱？", "… duōshao qián?", "… bao nhiêu tiền?", "这个多少钱？"],
  ["我想学中文。", "wǒ xiǎng xué Zhōngwén.", "tôi muốn học tiếng Trung.", "我想学中文。"],
  ["你会说中文吗？", "nǐ huì shuō Zhōngwén ma?", "bạn nói tiếng Trung được không?", "你会说中文吗？"],
  ["谢谢你。", "xièxie nǐ.", "cảm ơn bạn.", "谢谢你帮我。"],
];

/* ══ Tiếng Anh — 6 nhóm × 10 ══════════════════════════════════════════════ */

const EN_WORDS: Array<[string, string]> = [
  // [word, nghĩa]
  ["I", "tôi"],
  ["you", "bạn"],
  ["he", "anh ấy"],
  ["she", "cô ấy"],
  ["we", "chúng tôi"],
  ["they", "họ"],
  ["my", "của tôi"],
  ["your", "của bạn"],
  ["this", "cái này"],
  ["that", "cái kia"],

  ["one", "một"],
  ["two", "hai"],
  ["three", "ba"],
  ["four", "bốn"],
  ["five", "năm"],
  ["six", "sáu"],
  ["seven", "bảy"],
  ["eight", "tám"],
  ["nine", "chín"],
  ["ten", "mười"],

  ["family", "gia đình"],
  ["mother", "mẹ"],
  ["father", "bố"],
  ["sister", "chị/em gái"],
  ["brother", "anh/em trai"],
  ["baby", "em bé"],
  ["parents", "cha mẹ"],
  ["son", "con trai"],
  ["daughter", "con gái"],
  ["friend", "người bạn"],

  ["Monday", "thứ Hai"],
  ["Tuesday", "thứ Ba"],
  ["Wednesday", "thứ Tư"],
  ["Thursday", "thứ Năm"],
  ["Friday", "thứ Sáu"],
  ["Saturday", "thứ Bảy"],
  ["Sunday", "Chủ nhật"],
  ["today", "hôm nay"],
  ["tomorrow", "ngày mai"],
  ["now", "bây giờ"],

  ["hello", "xin chào"],
  ["hi", "chào"],
  ["goodbye", "tạm biệt"],
  ["thanks", "cảm ơn"],
  ["sorry", "xin lỗi"],
  ["yes", "có / vâng"],
  ["no", "không"],
  ["please", "làm ơn"],
  ["good morning", "chào buổi sáng"],
  ["good night", "chúc ngủ ngon"],
];

/* Nhóm 6 — Động từ cơ bản (rút gọn theo Q3: "vài từ cơ bản"). */
const EN_VERBS: Array<[string, string]> = [
  ["be", "là / làm"],
  ["have", "có"],
  ["go", "đi"],
  ["do", "làm"],
  ["like", "thích"],
  ["want", "muốn"],
  ["eat", "ăn"],
  ["drink", "uống"],
  ["read", "đọc"],
  ["write", "viết"],
];

/* ══ Tiếng Anh — 10 mẫu câu ════════════════════════════════════════════════ */

const EN_PATTERNS: Array<[string, string]> = [
  ["I am …", "tôi là …"],
  ["My name is …", "tên tôi là …"],
  ["I have …", "tôi có …"],
  ["I like …", "tôi thích …"],
  ["I want …", "tôi muốn …"],
  ["This is …", "đây là …"],
  ["What is …?", "… là gì?"],
  ["How are you?", "bạn thế nào?"],
  ["Nice to meet you.", "rất vui được gặp bạn."],
  ["Thank you.", "cảm ơn bạn."],
];

/* ══ Dựng danh sách cuối cùng ═══════════════════════════════════════════════ */

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildChineseCards(): SeedCard[] {
  const cards: SeedCard[] = [];

  ZH_GROUPS.forEach((group, groupIndex) => {
    ZH_WORDS.slice(groupIndex * 10, groupIndex * 10 + 10).forEach(([hanzi, pinyin, meaning, example], index) => {
      cards.push({
        id: `card-zh-${group.group}-${String(index + 1).padStart(2, "0")}`,
        lang: "zh",
        front: pinyin,
        frontAlt: hanzi,
        back: meaning,
        example,
        group: group.group,
        mode: "recognize",
      });
    });
  });

  ZH_PATTERNS.forEach(([hanzi, pinyin, meaning, example], index) => {
    cards.push({
      id: `card-zh-pattern-${String(index + 1).padStart(2, "0")}`,
      lang: "zh",
      front: pinyin,
      frontAlt: hanzi,
      back: meaning,
      example,
      group: "pattern",
      mode: "produce",
    });
  });

  return cards;
}

function buildEnglishCards(): SeedCard[] {
  const cards: SeedCard[] = [];

  EN_GROUPS.slice(0, 5).forEach((group, groupIndex) => {
    EN_WORDS.slice(groupIndex * 10, groupIndex * 10 + 10).forEach(([word, meaning], index) => {
      cards.push({
        id: `card-en-${group.group}-${String(index + 1).padStart(2, "0")}`,
        lang: "en",
        front: word,
        back: meaning,
        group: group.group,
        mode: "recognize",
      });
    });
  });

  EN_VERBS.forEach(([word, meaning], index) => {
    cards.push({
      id: `card-en-verb-${String(index + 1).padStart(2, "0")}`,
      lang: "en",
      front: word,
      back: meaning,
      group: "verb",
      mode: "recognize",
    });
  });

  EN_PATTERNS.forEach(([phrase, meaning], index) => {
    cards.push({
      id: `card-en-pattern-${String(index + 1).padStart(2, "0")}`,
      lang: "en",
      front: phrase,
      back: meaning,
      group: "pattern",
      mode: "produce",
    });
  });

  return cards;
}

/** 140 thẻ: 70 zh (60 từ + 10 mẫu câu) + 70 en (60 từ + 10 mẫu câu). */
export const CARDS: SeedCard[] = [...buildChineseCards(), ...buildEnglishCards()];

/** Nhóm theo ngôn ngữ — dùng cho bộ lọc nhóm trong SRS. */
export const CARD_GROUP_LABELS: Record<string, string> = {
  greet: "Chào hỏi / Greetings",
  people: "Người & thân xã",
  food: "Đồ ăn",
  place: "Địa điểm",
  time: "Thời gian",
  verb: "Động từ & phó từ",
  pronoun: "Pronouns & cơ bản",
  number: "Numbers",
  family: "Family",
  day: "Days of week",
  pattern: "Mẫu câu",
};

export const CARD_SLUG_CHECK = slug;
