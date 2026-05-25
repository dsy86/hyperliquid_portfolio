const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json(
      {
        error: "INVALID_ADDRESS",
        message: "Pass a valid EVM address as ?address=0x...",
      },
      400,
    );
  }

  try {
    const role = await postInfo({ type: "userRole", user: address });

    return json({
      address,
      role: role.role,
      masterAddress: role.role === "agent" ? role.data.user : null,
    });
  } catch (error) {
    return json(
      {
        error: "AGENT_ROLE_LOAD_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      502,
    );
  }
}

async function postInfo(body) {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed: ${response.status}`);
  }

  return response.json();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
