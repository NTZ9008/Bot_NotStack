// ข้อมูลใน access token (JWT) — sub = id ผู้ใช้, tv = token version ณ ตอนออก token
export interface JwtPayload {
    sub: string;
    role: string;
    tv: number;
    jti?: string;
    exp?: number;
}

// cookie state ของ Discord OAuth (เซ็นด้วย JWT_SECRET)
export interface OAuthStatePayload {
    s: string;
    m: OAuthMode;
    uid: number | null;
    exp?: number;
}

export type OAuthMode = 'login' | 'link';
