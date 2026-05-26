export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const destinationChainId = Number(url.searchParams.get("destinationChainId"));

  if (!Number.isInteger(destinationChainId) || destinationChainId <= 0) {
    return json(
      {
        error: "INVALID_DESTINATION_CHAIN",
        message: "Pass ?destinationChainId=<number>.",
      },
      400,
    );
  }

  try {
    const response = await fetch(
      `https://iris-api.circle.com/v2/burn/USDC/fees/19/${destinationChainId}?forward=true`,
    );

    if (!response.ok) {
      throw new Error(`Circle fee request failed: ${response.status}`);
    }

    const fees = await response.json();
    const selectedFee = fees[0];
    const forwardFee =
      selectedFee?.forwardFee?.med ??
      selectedFee?.forwardFee?.high ??
      selectedFee?.forwardFee?.low ??
      0;

    return json({
      minimumFeeBps: selectedFee?.minimumFee ?? 0,
      forwardFeeUsdc: (forwardFee / 1_000_000).toString(),
      finalityThreshold: selectedFee?.finalityThreshold ?? 0,
    });
  } catch (error) {
    return json(
      {
        error: "CCTP_FEE_LOAD_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      502,
    );
  }
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
