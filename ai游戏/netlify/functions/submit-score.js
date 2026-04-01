const {
  TABLE_NAME,
  jsonResponse,
  getSupabaseConfig,
  buildSupabaseHeaders,
  mapBackendErrorMessage,
  validateScorePayload,
  parseSupabaseResponse
} = require("./_lib/leaderboard");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod === "GET") {
    return jsonResponse(200, {
      ok: true,
      message: "submit-score 函数已部署成功，请使用 POST 提交分数。",
      example: {
        method: "POST",
        url: "/.netlify/functions/submit-score",
        body: {
          nickname: "可欣玩家",
          score: 123
        }
      }
    });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "仅支持 POST 请求" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "请求体必须是合法 JSON" });
  }

  const validated = validateScorePayload(payload);
  if (validated.error) {
    return jsonResponse(400, { error: validated.error });
  }

  try {
    const { url, serviceRoleKey } = getSupabaseConfig();
    const response = await fetch(`${url}/rest/v1/${TABLE_NAME}`, {
      method: "POST",
      headers: buildSupabaseHeaders(serviceRoleKey, {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }),
      body: JSON.stringify({
        nickname: validated.nickname,
        score: validated.score
      })
    });

    const rows = await parseSupabaseResponse(response);
    const entry = Array.isArray(rows) ? rows[0] : null;

    return jsonResponse(200, {
      success: true,
      entry
    });
  } catch (error) {
    console.error("submit-score failed:", error);
    return jsonResponse(500, {
      error: mapBackendErrorMessage(error.message || "分数提交失败")
    });
  }
};
