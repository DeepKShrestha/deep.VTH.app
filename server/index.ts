import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { DB_FILE, DB_PROVIDER } from "./db";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const app = express();
const httpServer = createServer(app);
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use((req, res, next) => {
  const incoming = req.header("x-request-id");
  const requestId =
    typeof incoming === "string" && incoming.trim()
      ? incoming.trim()
      : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

app.use(express.urlencoded({ extended: false }));
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );
} else {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );
}
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many requests. Please retry later.",
    },
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function logJson(
  entry: Record<string, unknown>,
  source = "express",
): void {
  const payload = { source, timestamp: new Date().toISOString(), ...entry };
  console.log(JSON.stringify(payload));
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      logJson({
        type: "api_request",
        requestId: req.requestId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: duration,
        responseBody:
          capturedJsonResponse && process.env.LOG_RESPONSE_BODIES === "true"
            ? capturedJsonResponse
            : undefined,
      });
    }
  });

  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "vet-ast-app",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/ready", (_req, res) => {
  try {
    db.get(sql`SELECT 1 as ready`);
    res.json({
      status: "ready",
      database: DB_FILE,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      message: "Database unavailable",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

(async () => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEFAULT_ADMIN === "true") {
    logJson({
      type: "startup_warning",
      message:
        "ALLOW_DEFAULT_ADMIN=true in production. This should be disabled after initial bootstrap.",
    });
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logJson({
      type: "api_error",
      requestId: _req.requestId,
      status,
      message,
      stack: err instanceof Error ? err.stack : undefined,
      path: _req.path,
      method: _req.method,
    });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message, requestId: _req.requestId });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.requestTimeout = 120_000;
  httpServer.headersTimeout = 65_000;
  httpServer.keepAliveTimeout = 60_000;

  const server = httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      log(`db provider: ${DB_PROVIDER}`);
      log(`using database: ${DB_FILE}`);
    },
  );

  const shutdown = (signal: string) => {
    logJson({ type: "shutdown_signal", signal });
    server.close((err?: Error) => {
      if (err) {
        logJson({
          type: "shutdown_error",
          signal,
          message: err.message,
        });
        process.exit(1);
      }
      logJson({ type: "shutdown_complete", signal });
      process.exit(0);
    });
    setTimeout(() => {
      logJson({ type: "shutdown_timeout", signal });
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logJson({
      type: "unhandled_rejection",
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on("uncaughtException", (error) => {
    logJson({
      type: "uncaught_exception",
      message: error.message,
      stack: error.stack,
    });
    shutdown("uncaughtException");
  });
})();
