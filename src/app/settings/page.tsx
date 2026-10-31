import { env } from "@/lib/env";
import {
  getCostSummary,
  getDataStats,
  getUserProfile,
  listPrivacyLog,
} from "@/lib/settings";

import { ApiKeyPanel } from "@/components/settings/api-key-panel";
import { CostPanel } from "@/components/settings/cost-panel";
import { DataPanel } from "@/components/settings/data-panel";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const dynamic = "force-dynamic";

/**
 * S15 — Cài đặt & Chi phí (`/settings`).
 *
 * ⚠️ FR-SC-11 — key chỉ hiện dạng che, KHÔNG bao giờ trả key đầy đủ.
 * ⚠️ FR-SC-18 — mọi giá trị tiền là **ước tính** theo bảng giá model.
 */
export default async function SettingsPage() {
  const [profile, costs, stats, privacyLog] = await Promise.all([
    getUserProfile(),
    getCostSummary(30),
    getDataStats(),
    listPrivacyLog(50),
  ]);

  return (
    <div className="space-y-gutter-lg">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Cài đặt
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Hồ sơ · API key · chi phí AI · dữ liệu
        </p>
      </header>

      <SettingsTabs
        profile={
          <ProfileForm
            initial={{
              name: profile.name,
              goals: profile.goals,
              aiTone: profile.aiTone,
              learningLangs: profile.learningLangs,
              zhLevel: profile.zhLevel,
              enLevel: profile.enLevel,
              viLevel: profile.viLevel,
              languageStandard: profile.languageStandard,
              interviewLang: profile.interviewLang,
              monthlyBudgetUsd: profile.monthlyBudgetUsd,
              saverMode: profile.saverMode,
            }}
          />
        }
        apiKey={
          <ApiKeyPanel
            initialHasKey={Boolean(env.anthropicApiKey)}
            initialMaskedKey={env.anthropicApiKey ? env.maskedKey : null}
          />
        }
        costs={<CostPanel initial={costs} />}
        data={
          <DataPanel initialStats={stats} initialPrivacyLog={privacyLog} />
        }
      />
    </div>
  );
}
