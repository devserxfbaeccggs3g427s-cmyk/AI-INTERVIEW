import { describe, expect, it } from "vitest";

import {
  ACTIVITY_TITLE_MAX,
  DATA_PREVIEW_MAX,
  DAILY_STATE_MAX_SECONDS,
  EVIDENCE_RATING_MIN,
  EVIDENCE_THRESHOLD,
  FRICTION_DAYS,
  INTERVIEW_QUESTION_COUNTS,
  PLAN_FALLBACK_SOURCE,
  QUICK_LOG_MAX_SECONDS,
  SRS_SESSION_MAX_CARDS,
  SLOT_CONTRACTS,
  SLOT_COUNT,
  SLOT_DOMAINS,
  SKILL_LEVEL_MAX,
  TEST_COUNTS,
  WEEKLY_REVIEW_DAY,
} from "@/lib/config";

/**
 * FR-AF-22 — Hằng số cấu hình toàn app (SLOT_COUNT, SKILL_LEVEL_MAX,
 * EVIDENCE_THRESHOLD, QUICK_LOG_MAX_SECONDS, SRS_SESSION_MAX_CARDS, TEST_COUNTS…).
 */
describe("FR-AF-22 — config.ts hằng số đúng SPEC", () => {
  it("SLOT_COUNT = 6 (S01)", () => {
    expect(SLOT_COUNT).toBe(6);
  });

  it("SLOT_DOMAINS đóng băng 4 domain theo vị trí slot (P5)", () => {
    expect([...SLOT_DOMAINS]).toEqual([
      "professional",
      "communication",
      "language",
      "language",
      "personal",
      "personal",
    ]);
  });

  it("SLOT_CONTRACTS đủ 6 slot, mỗi slot có min/max minutes", () => {
    expect(SLOT_CONTRACTS).toHaveLength(6);
    for (const slot of SLOT_CONTRACTS) {
      expect(slot.slot).toBeGreaterThanOrEqual(0);
      expect(slot.slot).toBeLessThan(6);
      expect(slot.minMinutes).toBeGreaterThan(0);
      expect(slot.maxMinutes).toBeGreaterThan(slot.minMinutes);
    }
    // Slot 2 = SRS, slot 4 = journal.
    expect(SLOT_CONTRACTS[2]!.kind).toBe("srs");
    expect(SLOT_CONTRACTS[4]!.kind).toBe("journal");
  });

  it("SKILL_LEVEL_MAX = 5 (thang 0–5)", () => {
    expect(SKILL_LEVEL_MAX).toBe(5);
  });

  it("EVIDENCE_THRESHOLD = 3, EVIDENCE_RATING_MIN = 3 (B4)", () => {
    expect(EVIDENCE_THRESHOLD).toBe(3);
    expect(EVIDENCE_RATING_MIN).toBe(3);
  });

  it("QUICK_LOG_MAX_SECONDS = 10 (P2)", () => {
    expect(QUICK_LOG_MAX_SECONDS).toBe(10);
  });

  it("DAILY_STATE_MAX_SECONDS = 15 (FR-PS-01)", () => {
    expect(DAILY_STATE_MAX_SECONDS).toBe(15);
  });

  it("SRS_SESSION_MAX_CARDS = 20 (FR-LG-04, AC-LG-3)", () => {
    expect(SRS_SESSION_MAX_CARDS).toBe(20);
  });

  it("INTERVIEW_QUESTION_COUNTS = [5,8,12]", () => {
    expect([...INTERVIEW_QUESTION_COUNTS]).toEqual([5, 8, 12]);
  });

  it("TEST_COUNTS đủ 4 loại (FR-LT-01)", () => {
    expect(TEST_COUNTS).toEqual({
      placement: 25,
      topic: 20,
      benchmark: 40,
      from_content: 10,
    });
  });

  it("PLAN_FALLBACK_SOURCE = 'fallback' (B5)", () => {
    expect(PLAN_FALLBACK_SOURCE).toBe("fallback");
  });

  it("WEEKLY_REVIEW_DAY = 'sunday'", () => {
    expect(WEEKLY_REVIEW_DAY).toBe("sunday");
  });

  it("FRICTION_DAYS = 3 (tertiary)", () => {
    expect(FRICTION_DAYS).toBe(3);
  });

  it("ACTIVITY_TITLE_MAX = 120", () => {
    expect(ACTIVITY_TITLE_MAX).toBe(120);
  });

  it("DATA_PREVIEW_MAX = 280 (C13)", () => {
    expect(DATA_PREVIEW_MAX).toBe(280);
  });
});