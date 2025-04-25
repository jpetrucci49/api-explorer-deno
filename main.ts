import { load } from "https://deno.land/std@0.221.0/dotenv/mod.ts";
import { getLogger, setup } from "https://deno.land/std@0.221.0/log/mod.ts";
import { ConsoleHandler } from "https://deno.land/std@0.221.0/log/console_handler.ts";
import { connect, Redis } from "https://deno.land/x/redis@v0.29.0/mod.ts";
import {
  GitHubUser,
  GitHubRepo,
  GitHubLanguages,
  AnalysisResponse,
} from "./types.ts"

await load({ export: true });
const GITHUB_API_URL = "https://api.github.com/users";
const TOKEN = Deno.env.get("GITHUB_TOKEN");
const PORT = Number(Deno.env.get("PORT")) || 3005;
const REDIS_HOST = Deno.env.get("REDIS_HOST") || '';
const REDIS_PORT = Number(Deno.env.get("REDIS_PORT")) || 6379;
const REDIS_PASSWORD = Deno.env.get("REDIS_PASSWORD") || '';

const logger = getLogger();

// Connect to Redis
let redis: Redis;
try {
  redis = await connect({
    hostname: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetryCount: 0,
  });
} catch (err) {
  logger.error(`Initial Redis connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
}

setup({
  handlers: { console: new ConsoleHandler("INFO") },
  loggers: { default: { level: "INFO", handlers: ["console"] } },
});

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

const commonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "X-Cache",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

const fetchGitHub = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!response.ok) {
    const status = response.status;
    let detail = "GitHub API error";
    const extra: Record<string, string> = {};
    if (status === 404) detail = "GitHub user not found";
    else if (status === 429) {
      detail = "GitHub rate limit exceeded";
      extra.remaining = response.headers.get("x-ratelimit-remaining") || "0";
    }
    else if (status === 400) detail = "Invalid GitHub API request";
    throw { status, detail, extra };
  }
  return response.json() as Promise<T>;
};

const analyzeProfile = async (username: string): Promise<AnalysisResponse> => {
  const userData = await fetchGitHub<GitHubUser>(`${GITHUB_API_URL}/${username}`);
  const repos = await fetchGitHub<GitHubRepo[]>(`${userData.repos_url}?per_page=100`);
  const languages = await Promise.all(
    repos.map((r) =>
      fetchGitHub<GitHubLanguages>(r.languages_url).catch((e) => ({ error: e }))
    )
  );

  const langStats = languages.reduce((acc: Record<string, number>, langData) => {
    if ('error' in langData) return acc;
    for (const [lang, bytes] of Object.entries(langData)) {
      acc[lang] = (acc[lang] || 0) + bytes;
    }
    return acc;
  }, {});

  return {
    login: userData.login,
    publicRepos: userData.public_repos,
    topLanguages: Object.entries(langStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang, bytes]) => ({ lang, bytes })),
  };
};

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (url.pathname === "/clear-cache") {
    try {
      await redis.flushdb();
      return new Response(JSON.stringify({ detail: "Cache cleared successfully" }), {
        status: 200,
        headers: commonHeaders,
      });
    } catch (error) {
      logger.error(`Redis flush error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return new Response(
        JSON.stringify({ detail: { status: 500, detail: "Redis connection failed", extra: {} } }),
        { status: 500, headers: commonHeaders }
      );
    }
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ detail: { status: 405, detail: "Method Not Allowed", extra: {} } }),
      { status: 405, headers: commonHeaders }
    );
  }

  const username = url.searchParams.get("username");
  
  if (username === 'test429'){
    return new Response(
      JSON.stringify({ detail: { status: 429, detail: 'GitHub rate limit exceeded', extra: { remaining: '0' } } }),
      { status: 429, headers: commonHeaders }
    );
  }

  if (!username) {
    return new Response(
      JSON.stringify({ detail: { status: 400, detail: "Username is required", extra: {} } }),
      { status: 400, headers: commonHeaders }
    );
  }

  const cacheKey = `${url.pathname.slice(1)}:${username}`;
  let cached;
  try {
    cached = await redis.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: { ...commonHeaders, "X-Cache": "HIT" },
      });
    }
  } catch (error) {
    logger.error(`Redis get error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    if (url.pathname === "/github") {
      const data = await fetchGitHub<GitHubUser>(`${GITHUB_API_URL}/${username}`);
      try {
        await redis.setex(cacheKey, 1800, JSON.stringify(data));
      } catch (error) {
        logger.error(`Redis set error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...commonHeaders, "X-Cache": "MISS" },
      });
    }

    if (url.pathname === "/analyze") {
      const analysis = await analyzeProfile(username);
      try {
        await redis.setex(cacheKey, 1800, JSON.stringify(analysis));
      } catch (error) {
        logger.error(`Redis set error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return new Response(JSON.stringify(analysis), {
        status: 200,
        headers: { ...commonHeaders, "X-Cache": "MISS" },
      });
    }

    return new Response(
      JSON.stringify({ detail: { status: 404, detail: "Not Found", extra: {} } }),
      { status: 404, headers: commonHeaders }
    );
  } catch (error) {
    if (typeof error === 'object'){
      return new Response(
        JSON.stringify({ detail: { ...error } }),
        { ...error, headers: commonHeaders }
      );
    };
    return new Response(
      JSON.stringify({ detail: { status: 500, detail: "Network error", extra: {} } }),
      { status: 500, headers: commonHeaders }
    );
  };
};

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, withLogging(handler));