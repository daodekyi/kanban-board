export interface AuthEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export function bearerToken(request: Request): string {
  return (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
}

/**
 * Hỏi Supabase token này của ai. Trả về id user, hoặc null nếu token không
 * hợp lệ. Phải trả về id (không chỉ true/false) vì route /data dùng chính id
 * này làm owner_id cho mọi câu SQL — đây là lớp thay cho RLS của Postgres.
 */
export async function verifyUser(token: string, env: AuthEnv): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === "string" && user.id !== "" ? user.id : null;
  } catch {
    return null;
  }
}
