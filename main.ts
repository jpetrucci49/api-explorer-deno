import { load } from "https://deno.land/std@0.221.0/dotenv/mod.ts";
import { getLogger, setup } from "https://deno.land/std@0.221.0/log/mod.ts";
import { ConsoleHandler } from "https://deno.land/std@0.221.0/log/console_handler.ts";
import { connect } from "https://deno.land/x/redis@v0.29.0/mod.ts";

const GITHUB_API_URL = "https://api.github.com/users";
await load({ export: true }); // Loads .env into Deno.env
const TOKEN = Deno.env.get("GITHUB_TOKEN");
const PORT = Number(Deno.env.get("PORT")) || 3005;
const REDIS_HOST = Deno.env.get("REDIS_HOST") || '';
const REDIS_PORT = Number(Deno.env.get("REDIS_PORT"));
const REDIS_PASSWORD = Deno.env.get("REDIS_PASSWORD");

// Connect to Redis
const redis = await connect({
  hostname: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
});

setup({
  handlers: {
    console: new ConsoleHandler("INFO"),
  },
  loggers: {
    default: {
      level: "INFO",
      handlers: ["console"],
    },
  },
});

const logger = getLogger();

const withLogging = (handler: (req: Request) => Promise<Response>) => {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const start = Date.now();
    const res = await handler(req);
    const cacheHeader = res.headers.get("X-Cache") || "";
    logger.info(`${req.method} ${url.pathname}${url.search} ${res.status} ${cacheHeader} - ${Date.now() - start}ms`);
    return res;
  };
};

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.pathname !== "/github" || req.method !== "GET") {
    return new Response(JSON.stringify({ detail: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const username = url.searchParams.get("username");
  if (!username) {
    return new Response(JSON.stringify({ detail: "Username is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cacheKey = `github:${username}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return new Response(cached, { // Set status 200, and X-Cache to "HIT", RETURN data to terminate.
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "HIT",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", // No browser caching
        "Pragma": "no-cache",
        "Expires": "0",
        "Access-Control-Allow-Origin": "http://localhost:3000", // Add CORS for browser to recognize response.
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "*",
       },
    });
  }

  try {
    const response = await fetch(`${GITHUB_API_URL}/${username}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }, // TOKEN generated from github > settings > dev settings > access tokens > classic
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ detail: "GitHub API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = await response.json();
    await redis.setex(cacheKey, 1800, JSON.stringify(data));
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "*",
        "X-Cache": "MISS", // set X-Cache to "MISS" since it missed the cache check.
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch {
    return new Response(JSON.stringify({ detail: "Failed to reach GitHub" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, withLogging(handler));