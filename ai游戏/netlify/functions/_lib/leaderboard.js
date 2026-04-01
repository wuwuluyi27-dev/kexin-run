const TABLE_NAME = "leaderboard_scores";
const NICKNAME_PATTERN = /^[A-Za-z0-9_\u4e00-\u9fa5]{1,16}$/;

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("缺少 Supabase 环境变量配置");
  }

  return { url, serviceRoleKey };
}

function buildSupabaseHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

function sanitizeNickname(value) {
  return String(value || "").trim();
}

function mapBackendErrorMessage(message) {
  const text = String(message || "");

  if (!text) {
    return "排行榜服务暂时不可用";
  }

  if (text.includes("缺少 Supabase 环境变量配置")) {
    return "环境变量未配置，请检查 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY";
  }

  if (text.includes("relation") && text.includes(TABLE_NAME)) {
    return "数据表不存在，请确认 Supabase 中已创建 leaderboard_scores";
  }

  if (text.includes("column") && text.includes("nickname")) {
    return "数据表字段不匹配，请检查 nickname 字段";
  }

  if (text.includes("column") && text.includes("score")) {
    return "数据表字段不匹配，请检查 score 字段";
  }

  if (text.includes("column") && text.includes("created_at")) {
    return "数据表字段不匹配，请检查 created_at 字段";
  }

  if (text.includes("Failed to fetch") || text.includes("fetch failed")) {
    return "排行榜服务暂时不可用";
  }

  return text;
}

function validateScorePayload(payload) {
  const nickname = sanitizeNickname(payload.nickname);
  const score = Number(payload.score);

  if (!nickname) {
    return { error: "昵称不能为空" };
  }

  if (nickname.length > 16) {
    return { error: "昵称不能超过16个字符" };
  }

  if (/\s/.test(nickname)) {
    return { error: "昵称不能包含空格" };
  }

  if (!NICKNAME_PATTERN.test(nickname)) {
    return { error: "昵称格式不正确，仅支持中文、字母、数字和下划线" };
  }

  if (!Number.isFinite(score) || !Number.isInteger(score)) {
    return { error: "分数必须是整数" };
  }

  if (score < 0) {
    return { error: "分数不能小于0" };
  }

  if (score > 9999999) {
    return { error: "分数超出允许范围" };
  }

  return { nickname, score };
}

async function parseSupabaseResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const rawMessage =
      payload?.message ||
      payload?.error_description ||
      payload?.details ||
      payload?.hint ||
      "数据库请求失败";
    throw new Error(mapBackendErrorMessage(rawMessage));
  }

  return payload;
}

module.exports = {
  TABLE_NAME,
  jsonResponse,
  getSupabaseConfig,
  buildSupabaseHeaders,
  sanitizeNickname,
  mapBackendErrorMessage,
  validateScorePayload,
  parseSupabaseResponse
};
