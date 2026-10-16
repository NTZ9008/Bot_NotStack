// ข้อมูลที่ใช้จาก GitHub webhook payload (pull_request / review / comment / check_run / status)
export interface GithubUser {
    login?: string;
    avatar_url?: string;
    type?: string; // "Bot" สำหรับ bot เช่น github-actions, vercel
}

export interface GithubPullRequest {
    number: number;
    title: string;
    html_url: string;
    state?: string; // open | closed
    draft?: boolean;
    merged?: boolean;
    created_at?: string;
    closed_at?: string | null;
    user?: GithubUser | null;
    head?: { ref?: string; sha?: string } | null;
    base?: { ref?: string } | null;
    requested_reviewers?: GithubUser[] | null;
    requested_teams?: { name?: string; slug?: string }[] | null;
}

export interface GithubRepository {
    full_name: string;
    html_url: string;
}

export interface PullRequestEvent {
    action?: string;
    pull_request?: GithubPullRequest;
    repository?: GithubRepository;
}

export interface GithubReview {
    id: number;
    state?: string; // approved | changes_requested | commented | dismissed
    body?: string | null;
    html_url?: string;
    submitted_at?: string | null;
    user?: GithubUser | null;
}

export interface PullRequestReviewEvent {
    action?: string; // submitted | edited | dismissed
    review?: GithubReview;
    pull_request?: GithubPullRequest;
    repository?: GithubRepository;
}

export interface GithubComment {
    id: number;
    body?: string | null;
    html_url?: string;
    created_at?: string;
    user?: GithubUser | null;
}

// issue_comment ใช้กับทั้ง issue และ PR — เป็น PR เมื่อมี issue.pull_request
export interface IssueCommentEvent {
    action?: string; // created | edited | deleted
    issue?: { number: number; pull_request?: unknown };
    comment?: GithubComment;
    repository?: GithubRepository;
}

export interface PullRequestReviewCommentEvent {
    action?: string; // created | edited | deleted
    comment?: GithubComment;
    pull_request?: GithubPullRequest;
    repository?: GithubRepository;
}

export interface CheckRunEvent {
    action?: string; // created | completed | rerequested | requested_action
    check_run?: {
        name: string;
        head_sha: string;
        status?: string; // queued | in_progress | completed | waiting | requested | pending
        conclusion?: string | null;
        started_at?: string | null;
        completed_at?: string | null;
    };
    repository?: GithubRepository;
}

// commit status แบบเก่า (เช่น Vercel, Netlify, CI ภายนอก)
export interface StatusEvent {
    sha?: string;
    context?: string;
    state?: string; // pending | success | failure | error
    updated_at?: string;
    repository?: GithubRepository;
}
