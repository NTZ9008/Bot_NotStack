// ข้อมูลที่ใช้จาก GitHub webhook payload (pull_request / repository)
export interface GithubPullRequest {
    number: number;
    title: string;
    html_url: string;
    merged?: boolean;
    created_at?: string;
    closed_at?: string | null;
    user?: { login?: string; avatar_url?: string } | null;
    head?: { ref?: string; sha?: string } | null;
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
