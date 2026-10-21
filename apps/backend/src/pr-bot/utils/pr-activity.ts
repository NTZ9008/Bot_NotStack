import { githubMarkdownToDiscord } from './github-markdown';
import type { CheckRunEvent, GithubComment, GithubPullRequest, GithubRepository, GithubReview, StatusEvent } from '../interfaces/github.interface';

// ==========================================
// สถานะของ PR ที่สะสมจาก webhook หลายชนิด (เก็บเป็น JSON ใน pr_messages.activity)
// ทุกฟังก์ชันเป็น pure — รับ state เดิม คืน state ใหม่ — event ซ้ำ (GitHub redeliver) หรือมาไม่เรียงลำดับต้องได้ผลเดิม
// ==========================================

export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed';
export type CheckState = 'queued' | 'running' | 'passed' | 'failed' | 'skipped';

export interface PrSnapshot {
    number: number;
    title: string;
    url: string;
    repoFullName: string;
    repoUrl: string;
    author: string;
    avatarUrl: string | null;
    branch: string;
    baseBranch?: string; // ไม่มีในข้อมูลที่บันทึกก่อนเพิ่ม field นี้
    headSha: string;
    state: 'open' | 'closed' | 'merged';
    draft: boolean;
    createdAt: string | null;
    closedAt: string | null;
}

export interface PrComment {
    id: string;
    author: string;
    body: string;
    url: string;
    at: string;
}

export interface PrActivity {
    pr?: PrSnapshot;
    reviews: Record<string, { state: ReviewState; at: string }>;
    requested: string[];
    checks: Record<string, { name: string; state: CheckState; at: string }>;
    commentIds: string[];
    comments: PrComment[]; // ล่าสุดก่อน เก็บไม่เกิน MAX_COMMENTS
}

export const MAX_COMMENTS = 3;
// เก็บเป็น markdown ที่แปลงสำหรับ Discord แล้ว — ยาวพอให้อ่านรู้เรื่อง แต่ 3 อันรวมกันยังไม่เกินขนาด embed
const COMMENT_BODY_LIMIT = 1000;
const EPOCH = new Date(0).toISOString();

const toIso = (value: string | null | undefined): string => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isNaN(time) ? EPOCH : new Date(time).toISOString();
};

// แถวเก่าที่สร้างก่อนมีคอลัมน์ activity จะเป็น {} — เติมค่าเริ่มต้นให้ครบ
export function normalizeActivity(value: unknown): PrActivity {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<PrActivity>) : {};
    return {
        ...(raw.pr ? { pr: raw.pr } : {}),
        reviews: raw.reviews ?? {},
        requested: raw.requested ?? [],
        checks: raw.checks ?? {},
        commentIds: raw.commentIds ?? [],
        comments: raw.comments ?? [],
    };
}

const requestedOf = (pr: GithubPullRequest): string[] => [
    ...(pr.requested_reviewers ?? []).flatMap((user) => (user.login ? [user.login] : [])),
    ...(pr.requested_teams ?? []).flatMap((team) => (team.slug || team.name ? [`@${team.slug || team.name}`] : [])),
];

export function snapshotOf(pr: GithubPullRequest, repo: GithubRepository): PrSnapshot {
    return {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        repoFullName: repo.full_name,
        repoUrl: repo.html_url,
        author: pr.user?.login ?? 'unknown',
        avatarUrl: pr.user?.avatar_url ?? null,
        branch: pr.head?.ref ?? 'unknown',
        ...(pr.base?.ref ? { baseBranch: pr.base.ref } : {}),
        headSha: pr.head?.sha ?? '',
        state: pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
        draft: Boolean(pr.draft),
        createdAt: pr.created_at ?? null,
        closedAt: pr.closed_at ?? null,
    };
}

// event pull_request — ข้อมูล PR ล่าสุด; push commit ใหม่ (sha เปลี่ยน) → ล้างผล check ของ commit เก่า
export function applyPullRequest(activity: PrActivity, pr: GithubPullRequest, repo: GithubRepository, action?: string): PrActivity {
    const next = snapshotOf(pr, repo);
    // PR ที่ merge แล้วกลับไปเป็น open ไม่ได้ — กัน payload เก่าที่มาช้ามาทับ
    if (activity.pr?.state === 'merged') next.state = 'merged';
    // อิง action ด้วย เผื่อ payload ไม่มี field state
    if (action === 'closed' && next.state === 'open') next.state = 'closed';
    const shaChanged = Boolean(activity.pr?.headSha && next.headSha && activity.pr.headSha !== next.headSha);
    return { ...activity, pr: next, requested: requestedOf(pr), checks: shaChanged ? {} : activity.checks };
}

// review/comment event มี pull_request มาด้วย — ใช้อัปเดตรายชื่อคนที่ถูกขอ review
// และใช้เป็นข้อมูล PR ให้แถวเก่าที่ยังไม่มี snapshot (สร้างก่อนฟีเจอร์นี้)
function touchPullRequest(activity: PrActivity, pr: GithubPullRequest | undefined, repo: GithubRepository): PrActivity {
    if (!pr) return activity;
    return { ...activity, pr: activity.pr ?? snapshotOf(pr, repo), requested: requestedOf(pr) };
}

const REVIEW_STATES = new Set<string>(['approved', 'changes_requested', 'commented', 'dismissed']);
// ตอนเวลาเท่ากัน (เช่น dismiss review เดิม — submitted_at เท่าเดิม) ให้ state ที่ rank สูงกว่าชนะ
const REVIEW_RANK: Record<ReviewState, number> = { commented: 0, approved: 1, changes_requested: 1, dismissed: 2 };

// เหมือน GitHub: review แบบ comment ไม่ลบผล approve / request changes ที่ให้ไว้ก่อนหน้า
export function applyReview(
    activity: PrActivity,
    review: GithubReview,
    pr: GithubPullRequest | undefined,
    repo: GithubRepository,
    action?: string,
): PrActivity {
    let next = touchPullRequest(activity, pr, repo);
    const login = review.user?.login;
    const state = (action === 'dismissed' ? 'dismissed' : review.state?.toLowerCase()) as ReviewState;
    if (!login || !REVIEW_STATES.has(state)) return next;

    const at = toIso(review.submitted_at);
    const prev = next.reviews[login];
    const newer = !prev || at > prev.at || (at === prev.at && REVIEW_RANK[state] >= REVIEW_RANK[prev.state]);
    const keepsVerdict = state === 'commented' && (prev?.state === 'approved' || prev?.state === 'changes_requested');
    if (newer && !keepsVerdict) next = { ...next, reviews: { ...next.reviews, [login]: { state, at } } };
    // คนที่ส่ง review แล้วไม่ต้องแสดงว่า "รอ review" อีก (ถ้าถูกขอซ้ำ event pull_request ถัดไปจะเพิ่มกลับมาเอง)
    next = { ...next, requested: next.requested.filter((name) => name !== login) };

    // review ที่มีข้อความ แสดงในหน้า PR เหมือน comment หนึ่งอัน
    if (review.body?.trim() && state !== 'dismissed') {
        next = applyComment(
            next,
            `review:${review.id}`,
            { id: review.id, body: review.body, html_url: review.html_url, created_at: review.submitted_at ?? undefined, user: review.user },
            'created',
        );
    }
    return next;
}

// comment ของ bot (CI, preview deploy ฯลฯ) ไม่นับ — ไม่งั้นจะกลบ comment ของคน
export function applyComment(activity: PrActivity, id: string, comment: GithubComment, action?: string): PrActivity {
    if (comment.user?.type === 'Bot') return activity;
    if (action === 'deleted') {
        return { ...activity, commentIds: activity.commentIds.filter((x) => x !== id), comments: activity.comments.filter((c) => c.id !== id) };
    }
    const entry: PrComment = {
        id,
        author: comment.user?.login ?? 'unknown',
        body: githubMarkdownToDiscord(comment.body ?? '', COMMENT_BODY_LIMIT),
        url: comment.html_url ?? activity.pr?.url ?? '',
        at: toIso(comment.created_at),
    };
    const known = activity.commentIds.includes(id);
    // แก้ข้อความ comment ที่ไม่อยู่ในรายการล่าสุด → ไม่ต้องเพิ่มเข้าไปแทนอันใหม่กว่า
    if (known && !activity.comments.some((c) => c.id === id)) return activity;
    const comments = [entry, ...activity.comments.filter((c) => c.id !== id)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_COMMENTS);
    return { ...activity, commentIds: known ? activity.commentIds : [...activity.commentIds, id], comments };
}

export function applyPullRequestComment(
    activity: PrActivity,
    prefix: 'issue' | 'review-comment',
    comment: GithubComment,
    pr: GithubPullRequest | undefined,
    repo: GithubRepository,
    action?: string,
): PrActivity {
    return applyComment(touchPullRequest(activity, pr, repo), `${prefix}:${comment.id}`, comment, action);
}

const CHECK_RANK: Record<CheckState, number> = { queued: 0, running: 1, passed: 2, failed: 2, skipped: 2 };

function setCheck(activity: PrActivity, key: string, name: string, state: CheckState, at: string): PrActivity {
    const prev = activity.checks[key];
    // event มาไม่เรียงได้ — เก็บผลที่ใหม่กว่าเสมอ (เวลาเท่ากัน: ผลที่จบแล้วชนะสถานะกำลังรัน)
    if (prev && (at < prev.at || (at === prev.at && CHECK_RANK[state] < CHECK_RANK[prev.state]))) return activity;
    return { ...activity, checks: { ...activity.checks, [key]: { name, state, at } } };
}

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

export function checkRunState(run: NonNullable<CheckRunEvent['check_run']>): CheckState {
    if (run.status !== 'completed') return run.status === 'in_progress' ? 'running' : 'queued';
    if (run.conclusion === 'success') return 'passed';
    if (run.conclusion && FAILED_CONCLUSIONS.has(run.conclusion)) return 'failed';
    return 'skipped'; // neutral / skipped
}

// เก็บเฉพาะผลของ commit ล่าสุดของ PR
export function applyCheckRun(activity: PrActivity, run: NonNullable<CheckRunEvent['check_run']>): PrActivity {
    if (!activity.pr || run.head_sha !== activity.pr.headSha) return activity;
    // check ที่สั่งรันใหม่ได้ check_run ใหม่ เวลาเริ่มใหม่กว่า → ทับผลเดิมที่ชื่อเดียวกัน
    return setCheck(activity, `run:${run.name}`, run.name, checkRunState(run), toIso(run.completed_at ?? run.started_at));
}

export function applyStatus(activity: PrActivity, status: StatusEvent): PrActivity {
    if (!activity.pr || !status.context || status.sha !== activity.pr.headSha) return activity;
    const state: CheckState = status.state === 'success' ? 'passed' : status.state === 'pending' ? 'running' : 'failed';
    return setCheck(activity, `status:${status.context}`, status.context, state, toIso(status.updated_at));
}

// ==========================================
// สรุปสำหรับแสดงผล
// ==========================================
export type ReviewDecision = 'changes_requested' | 'approved' | 'pending';

export function reviewersBy(activity: PrActivity, state: ReviewState): string[] {
    return Object.entries(activity.reviews)
        .filter(([, review]) => review.state === state)
        .map(([login]) => login)
        .sort((a, b) => a.localeCompare(b));
}

export function reviewDecision(activity: PrActivity): ReviewDecision {
    if (reviewersBy(activity, 'changes_requested').length) return 'changes_requested';
    if (reviewersBy(activity, 'approved').length) return 'approved';
    return 'pending';
}
