// Minimal stand-in for Safaricom Daraja's OAuth + STK query APIs, for tests.
// The backend talks to it when MPESA_API_BASE_URL points here.
import http from "node:http";

export function startFakeDaraja(port) {
  const outcomes = new Map(); // CheckoutRequestID → { ResultCode, ResultDesc } | "processing"
  let queries = 0;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.url.startsWith("/oauth/v1/generate")) return send(200, { access_token: "fake-token", expires_in: "3599" });
      if (req.url === "/mpesa/stkpushquery/v1/query") {
        queries++;
        const outcome = outcomes.get(JSON.parse(body).CheckoutRequestID);
        if (!outcome) return send(400, { errorCode: "400.002.02", errorMessage: "Bad Request - Invalid CheckoutRequestID" });
        if (outcome === "processing") return send(500, { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" });
        return send(200, { ResponseCode: "0", ResultCode: String(outcome.ResultCode), ResultDesc: outcome.ResultDesc });
      }
      send(404, { errorMessage: "not found" });
    });
  });

  return new Promise((resolve) =>
    server.listen(port, () =>
      resolve({
        set: (checkoutRequestId, outcome) => outcomes.set(checkoutRequestId, outcome),
        queries: () => queries,
        close: () => server.close(),
      })
    )
  );
}
