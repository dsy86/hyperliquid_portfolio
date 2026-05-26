const HYPERLIQUID_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", message: "Expected JSON body." }, 400);
  }

  if (!body?.action || !body?.signature || !Number.isFinite(Number(body?.nonce))) {
    return json(
      {
        error: "INVALID_PAYLOAD",
        message: "Pass action, signature, and nonce.",
      },
      400,
    );
  }

  try {
    const action = normalizeAction(body.action);
    const response = await fetch(HYPERLIQUID_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        signature: body.signature,
        nonce: body.nonce,
        vaultAddress: body.vaultAddress,
        expiresAfter: body.expiresAfter,
      }),
    });
    const result = await response.json();

    if (!response.ok || result.status === "err") {
      return json(
        {
          error: "HYPERLIQUID_ACTION_FAILED",
          message:
            typeof result.response === "string"
              ? result.response
              : `Hyperliquid exchange request failed: ${response.status}`,
          result,
        },
        502,
      );
    }

    return json(result);
  } catch (error) {
    return json(
      {
        error: "ACTION_SUBMIT_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      502,
    );
  }
}

export function onRequestOptions() {
  return cors();
}

function normalizeAction(action) {
  if (action?.type === "approveAgent" && action.agentName === "") {
    const { agentName: _agentName, ...nextAction } = action;
    return nextAction;
  }
  return action;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
