import { DEFAULT_FUND_REPORT_THEME, type FundReportThemeId, type FundTopicDetail } from '@notstack/shared';
import { renderThemedFundReportCard } from '../themes';

// ==========================================
// FUND REPORT CARD RENDERER — จุดเชื่อมต่อหลักสำหรับวาดการ์ดสรุปการเก็บเงินตามธีมที่เลือก
// ==========================================
export async function renderFundReportCard(
    topic: FundTopicDetail,
    compact = false,
    theme: FundReportThemeId = DEFAULT_FUND_REPORT_THEME,
): Promise<Buffer> {
    return renderThemedFundReportCard(topic, compact, theme);
}
