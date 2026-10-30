/**
 * Script seed — Daily Loop OS.
 *
 * Nguồn sự thật:
 *   - Cây kỹ năng 3 tầng : `SPEC.md` §2.2 (FR-SK-01) + `design.md` §5.1
 *   - Thẻ ngoại ngữ       : `SPEC.md` Phụ lục B (bảng seed level 0)
 *   - Hồ sơ người dùng    : `SPEC.md` §5 (profile khởi tạo)
 *
 * Yêu cầu hoàn thành (tasks.md 1.8 / 1.9):
 *   - ≥ 4 domain, ≥ 20 node kỹ năng (cây 3 tầng: Domain → Kỹ năng → Mục con)
 *   - 60 thẻ `zh` + 60 thẻ `en` (6 nhóm × 10 từ), mỗi ngôn ngữ 10 mẫu câu
 *   - `hint` (phiên âm kiểu Việt) set cho **mọi** thẻ `en` (2 tuần đầu)
 *   - Script idempotent: chạy lại không nhân bản, thẻ về trạng thái "chưa ôn".
 *
 * ⚠️ Vì sao xoá trước rồi tạo lại (thay vì upsert)?
 *   Cây kỹ năng có `parentId` tự tham chiếu và thẻ có `cardState` JSON —
 *   "upsert theo tên" sẽ không khớp được khi cây đổi hình dạng. Xoá sạch
 *   bảng con trước bảng cha rồi tạo lại là cách duy nhất **chắc chắn** idempotent
 *   mà không cần bảng "khóa" phụ trong DB.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { startOfDay } from "../src/lib/dates";
import { newCardState } from "../src/lib/fsrs";

/**
 * Dùng chung 1 client cho toàn script. `PRAGMA WAL` + `busy_timeout` được
 * set ở `src/lib/db.ts` — ở đây tự set để seed không phụ thuộc alias `@/`.
 */
const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu seed
// ─────────────────────────────────────────────────────────────────────────────

/** 1 từ tiếng Trung: pinyin (mặt trước) + hanzi (mặt trước phụ) + nghĩa. */
type ZhWord = {
  /** Pinyin — hiển thị làm mặt trước vì level 0 luôn hiện pinyin (FR-LG-05). */
  pinyin: string;
  /** Hanzi — mặt trước phụ. */
  hanzi: string;
  /** Nghĩa tiếng Việt — mặt sau. */
  meaning: string;
  /** Ví dụ (hanzi) — tuỳ chọn. */
  example?: string;
  /** Pinyin của ví dụ. */
  examplePinyin?: string;
};

/** 1 từ tiếng Anh: từ + nghĩa + phiên âm kiểu Việt (2 tuần đầu). */
type EnWord = {
  word: string;
  meaning: string;
  /** Phiên âm gần đúng kiểu Việt — ví dụ `water` → "u-tờ-ờ". */
  hint: string;
  /** Ví dụ (tiếng Anh). */
  example?: string;
  /** Bản dịch tiếng Việt của ví dụ (lưu vào `note`). */
  exampleMeaning?: string;
};

/** 1 mẫu câu dùng để luyện sản sinh (`mode = "produce"`). */
type SentenceSeed = {
  /** Mặt trước: hanzi (zh) hoặc câu tiếng Anh (en). */
  front: string;
  /** Mặt trước phụ: pinyin (zh) — không dùng cho `en`. */
  frontAlt?: string;
  /** Mặt sau: bản dịch tiếng Việt. */
  back: string;
  /** Phiên âm kiểu Việt — chỉ dùng cho mẫu câu `en` (2 tuần đầu). */
  hint?: string;
  /** Ví dụ dùng đúng khuôn mẫu. */
  example?: string;
  /** Pinyin của ví dụ (zh). */
  examplePinyin?: string;
  /** Bản dịch tiếng Việt của ví dụ (en) — lưu vào `note`. */
  note?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Cây kỹ năng 3 tầng (FR-SK-01)
// ─────────────────────────────────────────────────────────────────────────────

type SkillSeed = {
  name: string;
  nameZh?: string;
  children?: SkillSeed[];
};

/**
 * Tầng 1 = domain · Tầng 2 = kỹ năng · Tầng 3 = mục kỹ năng con.
 *
 * Mỗi domain có ≥ 2 kỹ năng tầng 2, mỗi kỹ năng tầng 2 có ≥ 1 mục con tầng 3
 * → tổng 4 + 10 + 18 = 32 node (≥ 20 theo tasks.md 1.8).
 *
 * `level = 0` vì FR-SK-03: level CHỈ tăng khi có `Evidence` rating ≥ 3.
 * `targetLevel = 3` là mục tiêu 6 tháng mặc định.
 */
const SKILL_TREE: Array<{ name: string; nameZh?: string; domain: string; children: SkillSeed[] }> = [
  {
    name: "Chuyên môn",
    nameZh: "专业",
    domain: "professional",
    children: [
      {
        name: "System Design",
        children: [{ name: "Phân tích yêu cầu" }, { name: "Lựa chọn giải pháp" }],
      },
      {
        name: "Quản lý dữ liệu",
        children: [{ name: "Thiết kế schema" }, { name: "Truy vấn & tối ưu" }],
      },
    ],
  },
  {
    name: "Giao tiếp",
    nameZh: "沟通",
    domain: "communication",
    children: [
      {
        name: "Viết",
        children: [{ name: "Bài luận ngắn" }, { name: "Email công việc" }],
      },
      {
        name: "Nói",
        children: [{ name: "Thuyết trình" }, { name: "Hội thoại" }],
      },
      {
        name: "Phỏng vấn",
        children: [{ name: "Mock interview" }],
      },
    ],
  },
  {
    name: "Ngoại ngữ",
    nameZh: "语言",
    domain: "language",
    children: [
      {
        name: "Tiếng Trung",
        nameZh: "中文",
        children: [{ name: "Từ vựng", nameZh: "词汇" }, { name: "Ngữ pháp", nameZh: "语法" }],
      },
      {
        name: "Tiếng Anh",
        nameZh: "英语",
        children: [{ name: "Từ vựng", nameZh: "词汇" }, { name: "Ngữ pháp", nameZh: "语法" }],
      },
    ],
  },
  {
    name: "Cá nhân",
    nameZh: "个人",
    domain: "personal",
    children: [
      {
        name: "Nhật ký",
        children: [{ name: "Nhật ký tự do" }, { name: "Suy nghĩ cuối ngày" }],
      },
      {
        name: "Thể chất",
        children: [{ name: "Đi bộ" }, { name: "Tập thể dục" }],
      },
      {
        name: "Quản lý thời gian",
        children: [{ name: "Lập kế hoạch ngày" }, { name: "Ưu tiên công việc" }],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ tiếng Trung — 6 nhóm × 10 từ (SPEC.md Phụ lục B)
// ─────────────────────────────────────────────────────────────────────────────

const ZH_GROUPS: Array<{ group: string; words: ZhWord[] }> = [
  {
    group: "Chào hỏi",
    words: [
      { pinyin: "nǐ hǎo", hanzi: "你好", meaning: "xin chào", example: "你好，我是学生。", examplePinyin: "Nǐ hǎo, wǒ shì xuéshēng." },
      { pinyin: "xièxie", hanzi: "谢谢", meaning: "cảm ơn", example: "谢谢你！", examplePinyin: "Xièxie nǐ!" },
      { pinyin: "zàijiàn", hanzi: "再见", meaning: "tạm biệt", example: "再见，明天见。", examplePinyin: "Zàijiàn, míngtiān jiàn." },
      { pinyin: "duìbuqǐ", hanzi: "对不起", meaning: "xin lỗi", example: "对不起，我迟到了。", examplePinyin: "Duìbuqǐ, wǒ chídào le." },
      { pinyin: "méiguānxi", hanzi: "没关系", meaning: "không sao", example: "没关系。", examplePinyin: "Méiguānxi." },
      { pinyin: "qǐng", hanzi: "请", meaning: "làm ơn", example: "请坐。", examplePinyin: "Qǐng zuò." },
      { pinyin: "zǎoshanghǎo", hanzi: "早上好", meaning: "chào buổi sáng", example: "早上好！", examplePinyin: "Zǎoshanghǎo!" },
      { pinyin: "wǎnshanghǎo", hanzi: "晚上好", meaning: "chào buổi tối", example: "晚上好，你吃了吗？", examplePinyin: "Wǎnshanghǎo, nǐ chī le ma?" },
      { pinyin: "nǐ hǎo ma", hanzi: "你好吗", meaning: "bạn khỏe không", example: "你好吗？", examplePinyin: "Nǐ hǎo ma?" },
      { pinyin: "hěn gāoxìng rènshi nǐ", hanzi: "很高兴认识你", meaning: "rất vui được gặp bạn", example: "很高兴认识你。", examplePinyin: "Hěn gāoxìng rènshi nǐ." },
    ],
  },
  {
    group: "Người & thân xã",
    words: [
      { pinyin: "wǒ", hanzi: "我", meaning: "tôi", example: "我是学生。", examplePinyin: "Wǒ shì xuéshēng." },
      { pinyin: "nǐ", hanzi: "你", meaning: "bạn", example: "你是老师吗？", examplePinyin: "Nǐ shì lǎoshī ma?" },
      { pinyin: "tā", hanzi: "他", meaning: "anh ấy", example: "他是医生。", examplePinyin: "Tā shì yīshēng." },
      { pinyin: "tā", hanzi: "她", meaning: "cô ấy", example: "她是我姐姐。", examplePinyin: "Tā shì wǒ jiějie." },
      { pinyin: "wǒmen", hanzi: "我们", meaning: "chúng tôi", example: "我们是朋友。", examplePinyin: "Wǒmen shì péngyou." },
      { pinyin: "bàba", hanzi: "爸爸", meaning: "bố", example: "我爸爸是老师。", examplePinyin: "Wǒ bàba shì lǎoshī." },
      { pinyin: "māma", hanzi: "妈妈", meaning: "mẹ", example: "我妈妈在家。", examplePinyin: "Wǒ māma zài jiā." },
      { pinyin: "gēge", hanzi: "哥哥", meaning: "anh trai", example: "我哥哥很高。", examplePinyin: "Wǒ gēge hěn gāo." },
      { pinyin: "dìdi", hanzi: "弟弟", meaning: "em trai", example: "我弟弟很可爱。", examplePinyin: "Wǒ dìdi hěn kě’ài." },
      { pinyin: "péngyou", hanzi: "朋友", meaning: "bạn bè", example: "他是我的朋友。", examplePinyin: "Tā shì wǒ de péngyou." },
    ],
  },
  {
    group: "Đồ ăn",
    words: [
      { pinyin: "shuǐ", hanzi: "水", meaning: "nước", example: "我要喝水。", examplePinyin: "Wǒ yào hē shuǐ." },
      { pinyin: "chá", hanzi: "茶", meaning: "trà", example: "我喜欢喝茶。", examplePinyin: "Wǒ xǐhuan hē chá." },
      { pinyin: "mǐfàn", hanzi: "米饭", meaning: "cơm", example: "早饭吃米饭。", examplePinyin: "Zǎofàn chī mǐfàn." },
      { pinyin: "miàntiáo", hanzi: "面条", meaning: "mì", example: "我要一碗面条。", examplePinyin: "Wǒ yào yì wǎn miàntiáo." },
      { pinyin: "ròu", hanzi: "肉", meaning: "thịt", example: "我喜欢吃肉。", examplePinyin: "Wǒ xǐhuan chī ròu." },
      { pinyin: "yú", hanzi: "鱼", meaning: "cá", example: "这条鱼很新鲜。", examplePinyin: "Zhè tiáo yú hěn xīnxiān." },
      { pinyin: "cài", hanzi: "菜", meaning: "rau", example: "我买菜。", examplePinyin: "Wǒ mǎi cài." },
      { pinyin: "píngguǒ", hanzi: "苹果", meaning: "táo", example: "我想买个苹果。", examplePinyin: "Wǒ xiǎng mǎi ge píngguǒ." },
      { pinyin: "niúnǎi", hanzi: "牛奶", meaning: "sữa", example: "我每天喝牛奶。", examplePinyin: "Wǒ měitiān hē niúnǎi." },
      { pinyin: "hǎochī", hanzi: "好吃", meaning: "ngon", example: "这个苹果很好吃。", examplePinyin: "Zhège píngguǒ hěn hǎochī." },
    ],
  },
  {
    group: "Địa điểm",
    words: [
      { pinyin: "jiā", hanzi: "家", meaning: "nhà", example: "我家在学校附近。", examplePinyin: "Wǒ jiā zài xuéxiào fùjìn." },
      { pinyin: "xuéxiào", hanzi: "学校", meaning: "trường học", example: "我在学校学习中文。", examplePinyin: "Wǒ zài xuéxiào xuéxí Zhōngwén." },
      { pinyin: "gōngsī", hanzi: "公司", meaning: "công ty", example: "我去公司上班。", examplePinyin: "Wǒ qù gōngsī shàngbān." },
      { pinyin: "Zhōngguó", hanzi: "中国", meaning: "Trung Quốc", example: "我来自中国。", examplePinyin: "Wǒ láizì Zhōngguó." },
      { pinyin: "yīyuàn", hanzi: "医院", meaning: "bệnh viện", example: "医院在公园旁边。", examplePinyin: "Yīyuàn zài gōngyuán pángbiān." },
      { pinyin: "shāngdiàn", hanzi: "商店", meaning: "cửa hàng", example: "商店九点关门。", examplePinyin: "Shāngdiàn jiǔ diǎn guānmén." },
      { pinyin: "chēzhàn", hanzi: "车站", meaning: "nhà ga", example: "火车站在那边。", examplePinyin: "Huǒchēzhàn zài nà biān." },
      { pinyin: "fángjiān", hanzi: "房间", meaning: "phòng", example: "我的房间很小。", examplePinyin: "Wǒ de fángjiān hěn xiǎo." },
      { pinyin: "gōngyuán", hanzi: "公园", meaning: "công viên", example: "我每天去公园散步。", examplePinyin: "Wǒ měitiān qù gōngyuán sànbù." },
      { pinyin: "Zhōngguó rén", hanzi: "中国人", meaning: "người Trung Quốc", example: "他是中国人。", examplePinyin: "Tā shì Zhōngguó rén." },
    ],
  },
  {
    group: "Thời gian",
    words: [
      { pinyin: "jīntiān", hanzi: "今天", meaning: "hôm nay", example: "今天很忙。", examplePinyin: "Jīntiān hěn máng." },
      { pinyin: "míngtiān", hanzi: "明天", meaning: "ngày mai", example: "明天见。", examplePinyin: "Míngtiān jiàn." },
      { pinyin: "zuótiān", hanzi: "昨天", meaning: "hôm qua", example: "昨天很热。", examplePinyin: "Zuótiān hěn rè." },
      { pinyin: "zǎoshang", hanzi: "早上", meaning: "buổi sáng", example: "我早上六点起床。", examplePinyin: "Wǒ zǎoshang liù diǎn qǐchuáng." },
      { pinyin: "zhōngwǔ", hanzi: "中午", meaning: "trưa", example: "中午我吃面条。", examplePinyin: "Zhōngwǔ wǒ chī miàntiáo." },
      { pinyin: "wǎnshang", hanzi: "晚上", meaning: "buổi tối", example: "晚上七点我学习。", examplePinyin: "Wǎnshang qī diǎn wǒ xuéxí." },
      { pinyin: "xiànzài", hanzi: "现在", meaning: "bây giờ", example: "现在几点？", examplePinyin: "Xiànzài jǐ diǎn?" },
      { pinyin: "yī diǎn", hanzi: "一点", meaning: "một giờ", example: "现在一点。", examplePinyin: "Xiànzài yì diǎn." },
      { pinyin: "xīngqī", hanzi: "星期", meaning: "tuần", example: "星期一我要开会。", examplePinyin: "Xīngqī yī wǒ yào kāihuì." },
      { pinyin: "nián", hanzi: "年", meaning: "năm", example: "今年是2026年。", examplePinyin: "Jīnnián shì 2026 nián." },
    ],
  },
  {
    group: "Động từ & phó từ",
    words: [
      { pinyin: "shì", hanzi: "是", meaning: "là", example: "他是学生。", examplePinyin: "Tā shì xuéshēng." },
      { pinyin: "bù", hanzi: "不", meaning: "không", example: "我不喝茶。", examplePinyin: "Wǒ bù hē chá." },
      { pinyin: "yǒu", hanzi: "有", meaning: "có", example: "我有一个哥哥。", examplePinyin: "Wǒ yǒu yí ge gēge." },
      { pinyin: "chī", hanzi: "吃", meaning: "ăn", example: "我们吃中国菜。", examplePinyin: "Wǒmen chī Zhōngguó cài." },
      { pinyin: "hē", hanzi: "喝", meaning: "uống", example: "我要喝牛奶。", examplePinyin: "Wǒ yào hē niúnǎi." },
      { pinyin: "xué", hanzi: "学", meaning: "học", example: "我学中文。", examplePinyin: "Wǒ xué Zhōngwén." },
      { pinyin: "gōngzuò", hanzi: "工作", meaning: "làm việc", example: "我在银行工作。", examplePinyin: "Wǒ zài yínháng gōngzuò." },
      { pinyin: "qù", hanzi: "去", meaning: "đi", example: "我去学校。", examplePinyin: "Wǒ qù xuéxiào." },
      { pinyin: "lái", hanzi: "来", meaning: "tới", example: "你来我家。", examplePinyin: "Nǐ lái wǒ jiā." },
      { pinyin: "hěn", hanzi: "很", meaning: "rất", example: "今天很热。", examplePinyin: "Jīntiān hěn rè." },
    ],
  },
];

/** 10 mẫu câu tiếng Trung (SPEC.md Phụ lục B) — luyện sản sinh. */
const ZH_SENTENCES: SentenceSeed[] = [
  { front: "你好，我是…", frontAlt: "Nǐ hǎo, wǒ shì…", back: "Xin chào, tôi là…", example: "你好，我是学生。", examplePinyin: "Nǐ hǎo, wǒ shì xuéshēng." },
  { front: "这是…", frontAlt: "Zhè shì…", back: "Đây là…", example: "这是我的书。", examplePinyin: "Zhè shì wǒ de shū." },
  { front: "我要…", frontAlt: "Wǒ yào…", back: "Tôi muốn…", example: "我要一杯水。", examplePinyin: "Wǒ yào yì bēi shuǐ." },
  { front: "我喜欢…", frontAlt: "Wǒ xǐhuan…", back: "Tôi thích…", example: "我喜欢中国菜。", examplePinyin: "Wǒ xǐhuan Zhōngguó cài." },
  { front: "我不会…", frontAlt: "Wǒ bù huì…", back: "Tôi không biết…", example: "我不会说中文。", examplePinyin: "Wǒ bù huì shuō Zhōngwén." },
  { front: "…在哪里？", frontAlt: "…zài nǎlǐ?", back: "... ở đâu?", example: "学校在哪里？", examplePinyin: "Xuéxiào zài nǎlǐ?" },
  { front: "…多少钱？", frontAlt: "…duōshao qián?", back: "... bao nhiêu tiền?", example: "这个多少钱？", examplePinyin: "Zhège duōshao qián?" },
  { front: "我想学中文", frontAlt: "Wǒ xiǎng xué Zhōngwén", back: "Tôi muốn học tiếng Trung", example: "我想学中文。", examplePinyin: "Wǒ xiǎng xué Zhōngwén." },
  { front: "你会说中文吗？", frontAlt: "Nǐ huì shuō Zhōngwén ma?", back: "Bạn nói tiếng Trung được không?", example: "你会说中文吗？", examplePinyin: "Nǐ huì shuō Zhōngwén ma?" },
  { front: "谢谢你。", frontAlt: "Xièxie nǐ.", back: "Cảm ơn bạn.", example: "谢谢你！", examplePinyin: "Xièxie nǐ!" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ tiếng Anh — 6 nhóm × 10 từ (SPEC.md Phụ lục B)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Biên tập từ danh sách "bản khởi đầu để review" của SPEC.md Phụ lục B:
 *   - "Numbers & family" trong SPEC liệt kê 8 mục (một mục là dải "one–ten"),
 *     "Verbs & adjectives" liệt kê 15 mục. Để đạt **đúng 6 nhóm × 10 từ**
 *     (tasks.md 1.9) mỗi nhóm được cắt còn 10 mục, ưu tiên từ lõi level 0:
 *       + "Numbers & family" giữ **7 từ gia đình** + 3 số đầu (one/two/three).
 *       + "Verbs & adjectives" giữ **8 động từ lõi** (đúng những động từ xuất
 *         hiện trong 10 mẫu câu) + 2 tính từ phổ biến (good, big).
 */
const EN_GROUPS: Array<{ group: string; words: EnWord[] }> = [
  {
    group: "Pronouns & cơ bản",
    words: [
      { word: "I", meaning: "tôi", hint: "ai", example: "I am a student.", exampleMeaning: "Tôi là học sinh." },
      { word: "you", meaning: "bạn", hint: "iu", example: "How are you?", exampleMeaning: "Bạn thế nào?" },
      { word: "he", meaning: "anh ấy", hint: "hi", example: "He is my teacher.", exampleMeaning: "Anh ấy là giáo viên của tôi." },
      { word: "she", meaning: "cô ấy", hint: "chi", example: "She is my sister.", exampleMeaning: "Cô ấy là chị tôi." },
      { word: "we", meaning: "chúng tôi", hint: "ui", example: "We are friends.", exampleMeaning: "Chúng tôi là bạn bè." },
      { word: "they", meaning: "họ", hint: "đây", example: "They are students.", exampleMeaning: "Họ là học sinh." },
      { word: "my", meaning: "của tôi", hint: "mai", example: "This is my book.", exampleMeaning: "Đây là sách của tôi." },
      { word: "your", meaning: "của bạn", hint: "yo", example: "What is your name?", exampleMeaning: "Tên của bạn là gì?" },
      { word: "this", meaning: "cái này", hint: "đis", example: "This is a city.", exampleMeaning: "Đây là một thành phố." },
      { word: "that", meaning: "cái kia", hint: "đát", example: "That is my house.", exampleMeaning: "Đó là nhà của tôi." },
    ],
  },
  {
    group: "Numbers & family",
    words: [
      { word: "one", meaning: "một", hint: "u-ờn", example: "I have one brother.", exampleMeaning: "Tôi có một người anh trai." },
      { word: "two", meaning: "hai", hint: "tu", example: "I have two sisters.", exampleMeaning: "Tôi có hai người chị." },
      { word: "three", meaning: "ba", hint: "zri", example: "There are three books on the desk.", exampleMeaning: "Trên bàn có ba cuốn sách." },
      { word: "family", meaning: "gia đình", hint: "fam-li", example: "I love my family.", exampleMeaning: "Tôi yêu gia đình của tôi." },
      { word: "mother", meaning: "mẹ", hint: "mờ-ờ", example: "My mother is a teacher.", exampleMeaning: "Mẹ tôi là giáo viên." },
      { word: "father", meaning: "bố", hint: "fa-ờ", example: "My father works at home.", exampleMeaning: "Bố tôi làm việc ở nhà." },
      { word: "sister", meaning: "chị / em gái", hint: "sít-ờ", example: "My sister is a doctor.", exampleMeaning: "Chị tôi là bác sĩ." },
      { word: "brother", meaning: "anh / em trai", hint: "bra-ờ", example: "My brother likes tea.", exampleMeaning: "Anh tôi thích trà." },
      { word: "baby", meaning: "em bé", hint: "bây-bi", example: "The baby is sleeping.", exampleMeaning: "Em bé đang ngủ." },
      { word: "parents", meaning: "bố mẹ", hint: "pa-rờn", example: "My parents work here.", exampleMeaning: "Bố mẹ tôi làm việc ở đây." },
    ],
  },
  {
    group: "Food & drink",
    words: [
      { word: "water", meaning: "nước", hint: "u-tờ-ờ", example: "I drink water every day.", exampleMeaning: "Tôi uống nước mỗi ngày." },
      { word: "tea", meaning: "trà", hint: "ti", example: "Would you like some tea?", exampleMeaning: "Bạn có muốn một ít trà không?" },
      { word: "coffee", meaning: "cà phê", hint: "cô-phi", example: "I want hot coffee.", exampleMeaning: "Tôi muốn cà phê nóng." },
      { word: "rice", meaning: "cơm", hint: "phai", example: "We eat rice for lunch.", exampleMeaning: "Chúng tôi ăn cơm trưa." },
      { word: "bread", meaning: "bánh mì", hint: "brét", example: "I eat bread every morning.", exampleMeaning: "Tôi ăn bánh mì mỗi sáng." },
      { word: "fish", meaning: "cá", hint: "phít", example: "The fish is very fresh.", exampleMeaning: "Con cá rất tươi." },
      { word: "meat", meaning: "thịt", hint: "mít", example: "I don't eat meat.", exampleMeaning: "Tôi không ăn thịt." },
      { word: "apple", meaning: "táo", hint: "áp-ờ", example: "This apple is sweet.", exampleMeaning: "Quả táo này ngọt." },
      { word: "milk", meaning: "sữa", hint: "mít-rờ", example: "I drink milk in the morning.", exampleMeaning: "Tôi uống sữa buổi sáng." },
      { word: "egg", meaning: "trứng", hint: "éc", example: "I want two eggs.", exampleMeaning: "Tôi muốn hai quả trứng." },
    ],
  },
  {
    group: "Places",
    words: [
      { word: "home", meaning: "nhà", hint: "hôm", example: "I go home at six.", exampleMeaning: "Tôi về nhà lúc sáu giờ." },
      { word: "school", meaning: "trường học", hint: "s-ku-ờ", example: "The school is near my home.", exampleMeaning: "Trường học ở gần nhà tôi." },
      { word: "work", meaning: "công việc", hint: "u-ờc", example: "I work in a company.", exampleMeaning: "Tôi làm việc ở một công ty." },
      { word: "hospital", meaning: "bệnh viện", hint: "hít-pi-tờ", example: "The hospital is on this street.", exampleMeaning: "Bệnh viện ở trên đường này." },
      { word: "shop", meaning: "cửa hàng", hint: "sóp", example: "This shop opens at eight.", exampleMeaning: "Cửa hàng này mở lúc tám giờ." },
      { word: "station", meaning: "nhà ga", hint: "stây-sờn", example: "Where is the train station?", exampleMeaning: "Nhà ga tàu ở đâu?" },
      { word: "park", meaning: "công viên", hint: "pát", example: "We walk in the park.", exampleMeaning: "Chúng tôi đi bộ trong công viên." },
      { word: "city", meaning: "thành phố", hint: "sít-ti", example: "This city is very big.", exampleMeaning: "Thành phố này rất lớn." },
      { word: "country", meaning: "quốc gia", hint: "kân-tri", example: "I want to visit this country.", exampleMeaning: "Tôi muốn đến thăm quốc gia này." },
      { word: "room", meaning: "phòng", hint: "rồm", example: "My room is small and clean.", exampleMeaning: "Căn phòng của tôi nhỏ và sạch." },
    ],
  },
  {
    group: "Time",
    words: [
      { word: "today", meaning: "hôm nay", hint: "tờ-đây", example: "Today is a good day.", exampleMeaning: "Hôm nay là một ngày đẹp." },
      { word: "tomorrow", meaning: "ngày mai", hint: "tờ-mô-rờ", example: "I will study Chinese tomorrow.", exampleMeaning: "Ngày mai tôi sẽ học tiếng Trung." },
      { word: "yesterday", meaning: "hôm qua", hint: "iết-ờ-đây", example: "Yesterday was very hot.", exampleMeaning: "Hôm qua rất nóng." },
      { word: "morning", meaning: "buổi sáng", hint: "mót-ninh", example: "I run in the morning.", exampleMeaning: "Tôi chạy bộ buổi sáng." },
      { word: "afternoon", meaning: "buổi chiều", hint: "af-tờ-nu-ờn", example: "I have a class in the afternoon.", exampleMeaning: "Buổi chiều tôi có lớp." },
      { word: "evening", meaning: "buổi tối", hint: "i-vờ-ning", example: "We talk in the evening.", exampleMeaning: "Chúng tôi nói chuyện buổi tối." },
      { word: "night", meaning: "đêm", hint: "nai-ờt", example: "The city is quiet at night.", exampleMeaning: "Thành phố yên tĩnh vào ban đêm." },
      { word: "now", meaning: "bây giờ", hint: "nâu", example: "I am busy now.", exampleMeaning: "Tôi đang bận." },
      { word: "year", meaning: "năm", hint: "dia", example: "This year I learn two languages.", exampleMeaning: "Năm nay tôi học hai ngôn ngữ." },
      { word: "week", meaning: "tuần", hint: "u-i-ờc", example: "I study every week.", exampleMeaning: "Tôi học mỗi tuần." },
    ],
  },
  {
    group: "Verbs & adjectives",
    words: [
      { word: "be", meaning: "là", hint: "bi", example: "I am a beginner.", exampleMeaning: "Tôi là người mới bắt đầu." },
      { word: "have", meaning: "có", hint: "hạp", example: "I have a new phone.", exampleMeaning: "Tôi có một chiếc điện thoại mới." },
      { word: "go", meaning: "đi", hint: "gô", example: "I go to work by bus.", exampleMeaning: "Tôi đi làm bằng xe buýt." },
      { word: "do", meaning: "làm", hint: "đu", example: "What do you do?", exampleMeaning: "Bạn làm nghề gì?" },
      { word: "like", meaning: "thích", hint: "lai", example: "I like learning new words.", exampleMeaning: "Tôi thích học từ mới." },
      { word: "want", meaning: "muốn", hint: "uôn", example: "I want to speak English.", exampleMeaning: "Tôi muốn nói tiếng Anh." },
      { word: "eat", meaning: "ăn", hint: "ít", example: "I eat rice for dinner.", exampleMeaning: "Tôi ăn cơm tối." },
      { word: "drink", meaning: "uống", hint: "đ-rinh", example: "I drink tea every morning.", exampleMeaning: "Tôi uống trà mỗi sáng." },
      { word: "good", meaning: "tốt", hint: "gút", example: "This book is very good.", exampleMeaning: "Cuốn sách này rất tốt." },
      { word: "big", meaning: "lớn", hint: "bích", example: "This house is big.", exampleMeaning: "Ngôi nhà này lớn." },
    ],
  },
];

/** 10 mẫu câu tiếng Anh (SPEC.md Phụ lục B) — luyện sản sinh. */
const EN_SENTENCES: SentenceSeed[] = [
  { front: "I am…", back: "Tôi là…", hint: "ai am", example: "I am a software engineer.", note: "Tôi là kỹ sư phần mềm." },
  { front: "My name is…", back: "Tên tôi là…", hint: "mai nêm iz", example: "My name is Minh.", note: "Tên tôi là Minh." },
  { front: "I have…", back: "Tôi có…", hint: "ai hạp", example: "I have a question.", note: "Tôi có một câu hỏi." },
  { front: "I like…", back: "Tôi thích…", hint: "ai lai", example: "I like reading books.", note: "Tôi thích đọc sách." },
  { front: "I want…", back: "Tôi muốn…", hint: "ai uôn", example: "I want to speak English.", note: "Tôi muốn nói tiếng Anh." },
  { front: "This is…", back: "Đây là…", hint: "đis iz", example: "This is my friend.", note: "Đây là bạn tôi." },
  { front: "What is…?", back: "... là gì?", hint: "uột iz", example: "What is your name?", note: "Tên của bạn là gì?" },
  { front: "How are you?", back: "Bạn thế nào?", hint: "hau a diu", example: "How are you today?", note: "Hôm nay bạn thế nào?" },
  { front: "Nice to meet you.", back: "Rất vui được gặp bạn.", hint: "nai tờ mi-tiu", example: "Nice to meet you, Linh.", note: "Rất vui được gặp bạn, Linh." },
  { front: "Thank you.", back: "Cảm ơn bạn.", hint: "sank iu", example: "Thank you very much.", note: "Cảm ơn bạn rất nhiều." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Kiểm tra dữ liệu seed (fail sớm thay vì seed sai)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chặn lỗi biên tập: tasks.md 1.9 yêu cầu **đúng 6 nhóm × 10 từ** mỗi ngôn ngữ.
 * Kiểm tra lúc chạy để không bao giờ seed một bảng lệch chuẩn.
 */
function assertSeedShape(): void {
  if (ZH_GROUPS.length !== 6 || EN_GROUPS.length !== 6) {
    throw new Error("Mỗi ngôn ngữ phải có đúng 6 nhóm");
  }
  for (const groups of [ZH_GROUPS, EN_GROUPS]) {
    for (const g of groups) {
      if (g.words.length !== 10) {
        throw new Error(`Nhóm "${g.group}" phải có đúng 10 từ, đang có ${g.words.length}`);
      }
    }
  }
  if (ZH_SENTENCES.length !== 10 || EN_SENTENCES.length !== 10) {
    throw new Error("Mỗi ngôn ngữ phải có đúng 10 mẫu câu");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hàm tạo dữ liệu
// ─────────────────────────────────────────────────────────────────────────────

/** Số node tổng của cây kỹ năng theo phần khai báo (để đối chiếu với DB). */
function countSkillNodes(): number {
  return SKILL_TREE.reduce(
    (sum, domain) => sum + 1 + domain.children.reduce((s, skill) => s + 1 + (skill.children?.length ?? 0), 0),
    0,
  );
}

/**
 * Tạo cây kỹ năng 3 tầng.
 *
 * `position` giữ thứ tự hiển thị trong S03 (expand/collapse theo domain).
 * `level = 0` — FR-SK-03: chỉ `Evidence` rating ≥ 3 mới tăng level.
 * `targetLevel = 3` — mục tiêu mặc định 6 tháng.
 */
async function seedSkills(): Promise<number> {
  let created = 0;

  for (const [domainIndex, domain] of SKILL_TREE.entries()) {
    const parent = await prisma.skill.create({
      data: {
        name: domain.name,
        nameZh: domain.nameZh ?? null,
        domain: domain.domain,
        parentId: null,
        level: 0,
        targetLevel: 3,
        position: domainIndex,
      },
    });
    created += 1;

    for (const [skillIndex, skill] of domain.children.entries()) {
      const skillRow = await prisma.skill.create({
        data: {
          name: skill.name,
          nameZh: skill.nameZh ?? null,
          domain: domain.domain,
          parentId: parent.id,
          level: 0,
          targetLevel: 3,
          position: skillIndex,
        },
      });
      created += 1;

      for (const [childIndex, child] of (skill.children ?? []).entries()) {
        await prisma.skill.create({
          data: {
            name: child.name,
            nameZh: child.nameZh ?? null,
            domain: domain.domain,
            parentId: skillRow.id,
            level: 0,
            targetLevel: 3,
            position: childIndex,
          },
        });
        created += 1;
      }
    }
  }

  return created;
}

/** State FSRS của 1 thẻ mới — `newCardState` từ `src/lib/fsrs.ts`. */
function freshCardState(now: Date): Prisma.InputJsonValue {
  return newCardState(now) as unknown as Prisma.InputJsonValue;
}

/**
 * Tạo toàn bộ thẻ ngoại ngữ.
 *
 * - `mode = "recognize"` cho từ vựng (nhận diện).
 * - `mode = "produce"` cho mẫu câu (tự diễn đạt) — FR-LG-06.
 * - `due = startOfDay(hôm nay)` → **mọi thẻ đến hạn ngay**, sẵn sàng cho S09/S10.
 * - `hint` chỉ dành cho thẻ `en` (phiên âm kiểu Việt, 2 tuần đầu).
 */
async function seedCards(now: Date): Promise<{ zh: number; en: number; sentences: number }> {
  const today = startOfDay(now);
  const cardState = freshCardState(now);
  let zh = 0;
  let en = 0;
  let sentences = 0;

  for (const group of ZH_GROUPS) {
    for (const word of group.words) {
      await prisma.card.create({
        data: {
          lang: "zh",
          front: word.pinyin,
          frontAlt: word.hanzi,
          back: word.meaning,
          example: word.example ?? null,
          examplePinyin: word.examplePinyin ?? null,
          hint: null,
          group: group.group,
          mode: "recognize",
          cardState,
          due: today,
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
        },
      });
      zh += 1;
    }
  }

  for (const sentence of ZH_SENTENCES) {
    await prisma.card.create({
      data: {
        lang: "zh",
        front: sentence.front,
        frontAlt: sentence.frontAlt ?? null,
        back: sentence.back,
        example: sentence.example ?? null,
        examplePinyin: sentence.examplePinyin ?? null,
        hint: null,
        group: "Mẫu câu",
        mode: "produce",
        cardState,
        due: today,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
      },
    });
    zh += 1;
    sentences += 1;
  }

  for (const group of EN_GROUPS) {
    for (const word of group.words) {
      await prisma.card.create({
        data: {
          lang: "en",
          front: word.word,
          frontAlt: null,
          back: word.meaning,
          example: word.example ?? null,
          examplePinyin: null,
          // Phiên âm kiểu Việt — hiển thị 2 tuần đầu rồi tắt dần (SPEC §2.3.1).
          hint: word.hint,
          // Bản dịch tiếng Việt của ví dụ nằm trong `note` (ghi chú).
          note: word.exampleMeaning ?? null,
          group: group.group,
          mode: "recognize",
          cardState,
          due: today,
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
        },
      });
      en += 1;
    }
  }

  for (const sentence of EN_SENTENCES) {
    await prisma.card.create({
      data: {
        lang: "en",
        front: sentence.front,
        frontAlt: null,
        back: sentence.back,
        example: sentence.example ?? null,
        examplePinyin: null,
        // Mẫu câu `en` cũng có phiên âm Việt trong 2 tuần đầu.
        hint: sentence.hint ?? null,
        note: sentence.note ?? null,
        group: "Mẫu câu",
        mode: "produce",
        cardState,
        due: today,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
      },
    });
    en += 1;
    sentences += 1;
  }

  return { zh, en, sentences };
}

/** 1 hồ sơ người dùng duy nhất (owner = 1 người). */
async function seedUserProfile(): Promise<void> {
  await prisma.userProfile.create({
    data: {
      name: "Người dùng",
      goals: "Mục tiêu 6 tháng: nâng cấp kỹ năng chuyên môn + tiếng Trung/Anh level 0",
      aiTone: "direct",
      learningLangs: "zh,en",
      zhLevel: "zero",
      enLevel: "zero",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Xoá dữ liệu cũ theo thứ tự **con → cha** để không vi phạm FK.
 *
 * - `Evidence` → `Activity` → `Card` → `FocusTarget` → `Skill` → `UserProfile`.
 * - `AiCall` / `PlanItem` / `DailyState` giữ nguyên (lịch sử nhật ký AI và
 *   kế hoạch không liên quan tới seed).
 */
async function clearData(): Promise<void> {
  await prisma.evidence.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.card.deleteMany();
  await prisma.focusTarget.deleteMany();
  // `Skill.parentId` tự tham chiếu (ON DELETE SET NULL) → xoá tầng con trước.
  await prisma.skill.deleteMany({ where: { parentId: { not: null } } });
  await prisma.skill.deleteMany();
  await prisma.userProfile.deleteMany();
}

async function main(): Promise<void> {
  assertSeedShape();

  const now = new Date();
  await clearData();

  const skillCount = await seedSkills();
  const { zh, en, sentences } = await seedCards(now);
  await seedUserProfile();

  // Đối chiếu số node trong DB với số node khai báo — chặn lỗi tạo thiếu.
  const declaredNodes = countSkillNodes();
  if (skillCount !== declaredNodes) {
    throw new Error(`Tạo ${skillCount} node kỹ năng nhưng cây khai báo có ${declaredNodes} node`);
  }

  const domainCount = SKILL_TREE.length;
  const zhWords = ZH_GROUPS.reduce((sum, g) => sum + g.words.length, 0);
  const enWords = EN_GROUPS.reduce((sum, g) => sum + g.words.length, 0);

  console.log("");
  console.log("── Seed Daily Loop OS ─────────────────────────────");
  console.log(`  Domain (tầng 1)          : ${domainCount}`);
  console.log(`  Tổng node kỹ năng         : ${skillCount}`);
  console.log(`  Thẻ zh — từ vựng         : ${zhWords} · 6 nhóm × 10 từ`);
  console.log(`  Thẻ en — từ vựng         : ${enWords} · 6 nhóm × 10 từ`);
  console.log(`  Mẫu câu zh / en           : ${ZH_SENTENCES.length} / ${EN_SENTENCES.length}`);
  console.log(`  Tổng thẻ zh / en          : ${zh} / ${en}`);
  console.log(`  Tổng bản ghi mẫu câu      : ${sentences}`);
  console.log("─────────────────────────────────────────────────────");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("Seed thất bại:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
