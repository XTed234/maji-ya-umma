import "./env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import signupRouter from "./routes/signup.js";
import meRouter from "./routes/me.js";
import adminRouter from "./routes/admin.js";
import readingsRouter from "./routes/readings.js";
import mpesaRouter from "./routes/mpesa.js";
import stripeRouter from "./routes/stripe.js";
import { assertStripeConfig } from "./services/stripe.js";
import { broker, BrokerUnavailableError } from "./mq/publisher.js";
import { HttpError } from "./lib/util.js";

assertStripeConfig();

const app = express();

// Behind a load balancer / reverse proxy, set TRUST_PROXY to the number of
// proxies so rate limiting sees real client IPs.
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
app.use(helmet());

// Only the frontend's own origin(s) may call the API from a browser.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());
app.use(cors({ origin: allowedOrigins }));
// Before express.json(): the Stripe webhook needs the raw body for its signature.
app.use("/api/stripe", stripeRouter);
app.use(express.json({ limit: "1mb" }));

app.use("/api/signup", signupRouter);
app.use("/api/me", meRouter);
app.use("/api/admin", adminRouter);
app.use("/api/readings", readingsRouter);
app.use("/api/mpesa", mpesaRouter);

app.get("/", (req, res) => res.send("Maji ya Umma API"));

app.get("/api/health", (req, res) => {
  const brokerUp = broker.isConnected();
  res.status(brokerUp ? 200 : 503).json({ api: "ok", broker: brokerUp ? "connected" : "disconnected" });
});

app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Central error handler: expected errors get their message, everything else
// is logged and answered generically (no internals leak to clients).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err instanceof BrokerUnavailableError) {
    console.error(err.message);
    return res.status(503).json({ message: "Service temporarily unavailable, please try again shortly" });
  }
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
  console.error(`${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ message: "Something went wrong, please try again" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Connect (and declare queues) at boot; retries in the background if the
// broker is down, during which publishing routes answer 503.
broker.start();

const shutdown = async () => {
  await broker.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
