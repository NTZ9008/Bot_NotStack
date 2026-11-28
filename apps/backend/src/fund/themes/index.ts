import {
    DEFAULT_FUND_REPORT_THEME,
    buildFundReportCardData,
    type FundReportThemeId,
    type FundTopicDetail,
} from '@notstack/shared';
import { ReportThemeArcadeQuest } from './arcade-quest.renderer';
import { ReportThemeChristmasWonderland } from './christmas-wonderland.renderer';
import { ReportThemeCozyJourney } from './cozy-journey.renderer';
import { ReportThemeDefault } from './default-theme.renderer';
import { ReportThemeMinimalFinance } from './minimal-finance.renderer';
import type { ReportThemeRenderer } from './report-theme.types';

export const REPORT_THEME_RENDERERS: Record<FundReportThemeId, ReportThemeRenderer> = {
    default: ReportThemeDefault,
    'minimal-finance': ReportThemeMinimalFinance,
    'arcade-quest': ReportThemeArcadeQuest,
    'cozy-journey': ReportThemeCozyJourney,
    'christmas-wonderland': ReportThemeChristmasWonderland,
};

export function getReportThemeRenderer(theme: FundReportThemeId = DEFAULT_FUND_REPORT_THEME): ReportThemeRenderer {
    return REPORT_THEME_RENDERERS[theme] ?? REPORT_THEME_RENDERERS[DEFAULT_FUND_REPORT_THEME];
}

export async function renderThemedFundReportCard(
    topic: FundTopicDetail,
    compact = false,
    theme: FundReportThemeId = DEFAULT_FUND_REPORT_THEME,
): Promise<Buffer> {
    const data = buildFundReportCardData(topic);
    return getReportThemeRenderer(theme).render(data, compact);
}

export { ReportThemeDefault, ReportThemeMinimalFinance, ReportThemeArcadeQuest, ReportThemeCozyJourney, ReportThemeChristmasWonderland };
export type { ReportThemeRenderer } from './report-theme.types';
