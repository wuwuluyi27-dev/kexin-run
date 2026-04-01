const {
  TABLE_NAME,
  jsonResponse,
  getSupabaseConfig,
  buildSupabaseHeaders,
  mapBackendErrorMessage,
  parseSupabaseResponse
} = require("./_lib/leaderboard");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "仅支持 GET 请求" });
  }

  try {
    const { url, serviceRoleKey } = getSupabaseConfig();
    const query = new URL(`${url}/rest/v1/${TABLE_NAME}`);
    query.searchParams.set("select", "id,nickname,score,created_at");
    query.searchParams.set("order", "score.desc,created_at.asc");
    query.searchParams.set("limit", "20");

    const response = await fetch(query.toString(), {
      headers: buildSupabaseHeaders(serviceRoleKey, {
        Accept: "application/json"
      })
    });

    const entries = await parseSupabaseResponse(response);
    return jsonResponse(200, {
      entries: Array.isArray(entries) ? entries : []
    });
  } catch (error) {
    console.error("get-leaderboard failed:", error);
    return jsonResponse(500, {
      error: mapBackendErrorMessage(error.message || "排行榜读取失败")
    });
  }
};
