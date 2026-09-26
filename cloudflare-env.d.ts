declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ALPHA_VANTAGE_API_KEY?: string;
    RESEARCH_SERVICE_URL?: string;
    RESEARCH_SERVICE_SECRET?: string;
  }
}
