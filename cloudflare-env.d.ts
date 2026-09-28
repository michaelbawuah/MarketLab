declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ALPHA_VANTAGE_API_KEY?: string;
    RESEARCH_SERVICE_URL?: string;
    RESEARCH_SERVICE_SECRET?: string;
    WORKSPACE_OWNER_EMAIL?: string;
    PUBLIC_REPORT_SHARING_ENABLED?: string;
    DISCUSSION_EMAIL_AUTH_ENABLED?: string;
    WORKOS_API_KEY?: string;
    WORKOS_CLIENT_ID?: string;
    WORKOS_COOKIE_PASSWORD?: string;
    WORKOS_REDIRECT_URI?: string;
  }
}
