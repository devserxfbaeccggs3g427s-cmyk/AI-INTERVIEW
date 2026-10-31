import { describe, expect, it } from "vitest";

import {
  classifyByRule,
  defaultTypeForDomain,
  inferDifficulty,
  inferLanguage,
  inferType,
} from "@/lib/log-classify";
import { isEvidenceWorthy, missingForNextLevel } from "@/lib/log";

describe("rule cục bộ — suy ra loại hoạt động (FR-QL-13)", () => {
  it("nhận diện ôn SRS", () => {
    expect(inferType("ôn 32 flashcard tiếng anh")).toBe("srs");
    expect(inferType("review SRS cards")).toBe("srs");
  });

  it("nhận diện luyện nói", () => {
    expect(inferType("luyện nói tiếng anh")).toBe("speak");
    expect(inferType("mock interview")).toBe("speak");
  });

  it("nhận diện viết", () => {
    expect(inferType("viết bài essay")).toBe("write");
    expect(inferType("soạn email")).toBe("write");
  });

  it("nhận diện nhật ký", () => {
    expect(inferType("ghi nhật ký buổi sáng")).toBe("journal");
  });

  it("nhận diện chăm sóc bản thân", () => {
    expect(inferType("đi bộ 20 phút")).toBe("health");
    expect(inferType("ngủ sớm")).toBe("health");
  });

  it("nhận diện học", () => {
    expect(inferType("học Spring Boot")).toBe("study");
  });

  it("không khớp ⇒ null (caller dùng mặc định theo domain)", () => {
    expect(inferType("xyz")).toBeNull();
    expect(inferType("")).toBeNull();
  });
});

describe("rule cục bộ — loại mặc định theo domain", () => {
  it("professional ⇒ study, communication ⇒ speak, language ⇒ srs, personal ⇒ health", () => {
    expect(defaultTypeForDomain("professional")).toBe("study");
    expect(defaultTypeForDomain("communication")).toBe("speak");
    expect(defaultTypeForDomain("language")).toBe("srs");
    expect(defaultTypeForDomain("personal")).toBe("health");
  });
});

describe("rule cục bộ — mức độ khó", () => {
  it("mặc định 2 (trung bình)", () => {
    expect(inferDifficulty("làm gì đó")).toBe(2);
  });

  it("nhận diện khó / dễ", () => {
    expect(inferDifficulty("bài nâng cao")).toBe(4);
    expect(inferDifficulty("xem lại kiến thức")).toBe(1);
    expect(inferDifficulty("debug lỗi hiệu năng")).toBe(3);
  });
});

describe("rule cục bộ — ngôn ngữ (Q2, FR-QL-24)", () => {
  it("nhận diện en / zh / vi", () => {
    expect(inferLanguage("học tiếng anh")).toBe("en");
    expect(inferLanguage("luyện tiếng trung")).toBe("zh");
    expect(inferLanguage("ghi tiếng việt")).toBe("vi");
  });

  it("không nhận diện ⇒ null", () => {
    expect(inferLanguage("học chuyên môn")).toBeNull();
  });
});

describe("rule cục bộ — khớp kỹ năng", () => {
  const skills = [
    { id: "s1", name: "Spring Boot", domain: "professional" },
    { id: "s2", name: "JPA / Hibernate", domain: "professional" },
    { id: "s3", name: "Tiếng Anh", domain: "language" },
  ];

  it("khớp kỹ năng theo tên trong mô tả", () => {
    const result = classifyByRule(
      { text: "học Spring Boot", domain: "professional" },
      skills,
    );

    expect(result.skillId).toBe("s1");
    expect(result.skillName).toBe("Spring Boot");
  });

  it("khớp kỹ năng dài hơn được ưu tiên", () => {
    const result = classifyByRule(
      { text: "học JPA / Hibernate với Spring Boot", domain: "professional" },
      skills,
    );

    expect(result.skillId).toBe("s2");
  });

  it("không khớp ⇒ skillId null (không bịa kỹ năng)", () => {
    const result = classifyByRule(
      { text: "làm việc linh tinh", domain: "professional" },
      skills,
    );

    expect(result.skillId).toBeNull();
    expect(result.skillName).toBeNull();
  });

  it("chỉ khớp kỹ năng cùng domain", () => {
    const result = classifyByRule(
      { text: "luyện Tiếng Anh", domain: "professional" },
      skills,
    );

    expect(result.skillId).toBeNull();
  });

  it("hoạt động ngoại ngữ ⇒ có language", () => {
    const result = classifyByRule(
      { text: "ôn flashcard tiếng anh", domain: "language" },
      skills,
    );

    expect(result.language).toBe("en");
  });

  it("hoạt động không phải ngoại ngữ ⇒ language null", () => {
    const result = classifyByRule(
      { text: "học Spring Boot", domain: "professional" },
      skills,
    );

    expect(result.language).toBeNull();
  });
});

describe("tiêu chuẩn bằng chứng (FR-SK-03)", () => {
  it("chỉ rating ≥ 3 mới đáng tính", () => {
    expect(isEvidenceWorthy(1)).toBe(false);
    expect(isEvidenceWorthy(2)).toBe(false);
    expect(isEvidenceWorthy(3)).toBe(true);
    expect(isEvidenceWorthy(4)).toBe(true);
    expect(isEvidenceWorthy(null)).toBe(false);
  });

  it("số BC còn thiếu cho bậc kế tiếp", () => {
    expect(missingForNextLevel(0)).toBe(3);
    expect(missingForNextLevel(3)).toBe(3);
    expect(missingForNextLevel(5)).toBe(1);
    expect(missingForNextLevel(6)).toBe(3);
  });
});
