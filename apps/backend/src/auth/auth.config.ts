import crypto from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.validation";

const hostOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

// ==========================================
// ⚙️ AUTH CONFIG — ค่าจาก .env ที่ระบบ login ใช้ (อ่านครั้งเดียวตอนเปิดเซิร์ฟเวอร์)
// ==========================================
@Injectable()
export class AuthConfig {
  private readonly logger = new Logger("Auth");

  readonly isProduction: boolean;
  readonly jwtSecret: string;
  // URL หน้า Dashboard — ปลายทาง redirect หลัง login ด้วย Discord (ไม่ตั้ง = path เฉยๆ บน origin เดียวกับ API)
  readonly dashboardUrl: string | null;
  // host ที่อนุญาตให้ยิง POST เข้ามา (กัน CSRF) — นอกเหนือจาก Host header ของ request เอง
  readonly allowedHosts: Set<string>;
  readonly adminSeed: { username?: string; password?: string };
  readonly discord: {
    enabled: boolean;
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
    // Discord ID ที่ได้ role ADMIN อัตโนมัติตอนสมัครครั้งแรก
    adminIds: Set<string>;
  };
  // production ใช้ cookie prefix บังคับ Secure (+ Path=/ สำหรับ __Host-) ให้เบราว์เซอร์ช่วยกันการเขียนทับ cookie
  readonly cookie: { access: string; refresh: string; oauthState: string };

  constructor(config: ConfigService<Env, true>) {
    this.isProduction =
      config.get("NODE_ENV", { infer: true }) === "production";
    this.jwtSecret = this.resolveJwtSecret(
      config.get("JWT_SECRET", { infer: true }) ??
        config.get("SESSION_SECRET", { infer: true }),
    );
    this.dashboardUrl = config.get("DASHBOARD_URL", { infer: true }) ?? null;
    this.allowedHosts = new Set(
      [
        this.dashboardUrl ?? "https://bntdash.arlifzs.site",
        ...config.get("CORS_ORIGINS", { infer: true }),
      ]
        .map(hostOf)
        .filter((host): host is string => Boolean(host)),
    );
    this.adminSeed = {
      username: config.get("ADMIN_USERNAME", { infer: true }),
      password: config.get("ADMIN_PASSWORD", { infer: true }),
    };

    const clientSecret = config.get("DISCORD_CLIENT_SECRET", { infer: true });
    const redirectUri = config.get("DISCORD_REDIRECT_URI", { infer: true });
    const clientId = config.get("DISCORD_CLIENT_ID", { infer: true });
    this.discord = {
      enabled: Boolean(clientId && clientSecret && redirectUri),
      clientId,
      clientSecret,
      redirectUri,
      adminIds: new Set(config.get("ADMIN_DISCORD_IDS", { infer: true })),
    };

    this.cookie = {
      access: this.isProduction ? "__Host-ns_at" : "ns_at",
      refresh: this.isProduction ? "__Secure-ns_rt" : "ns_rt",
      oauthState: this.isProduction ? "__Secure-ns_oauth" : "ns_oauth",
    };
  }

  // URL ของหน้าใน Dashboard สำหรับ redirect (เช่น '/login?error=...')
  dashboardPath(path: string): string {
    return this.dashboardUrl
      ? new URL(path, this.dashboardUrl).toString()
      : path;
  }

  // JWT_SECRET ควรยาว 32 ตัวอักษรขึ้นไป — ถ้าไม่ได้ตั้ง (หรือสั้นเกิน) จะสุ่ม secret ชั่วคราวแทน
  // (ยังปลอดภัย แต่ทุกคนต้อง login ใหม่ทุกครั้งที่รีสตาร์ทบอท)
  private resolveJwtSecret(secret: string | undefined): string {
    if (secret && secret.length >= 32) return secret;
    this.logger.warn(
      "⚠️ ยังไม่ได้ตั้ง JWT_SECRET (หรือสั้นกว่า 32 ตัวอักษร) — ใช้ secret สุ่มชั่วคราว ทุกคนจะต้อง login ใหม่เมื่อรีสตาร์ท",
    );
    return crypto.randomBytes(48).toString("base64url");
  }
}
