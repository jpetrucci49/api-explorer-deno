const GITHUB_API_URL = "https://api.github.com/users";

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

  try {
    const response = await fetch(`${GITHUB_API_URL}/${username}`);
    if (!response.ok) {
      return new Response(JSON.stringify({ detail: "GitHub API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch {
    return new Response(JSON.stringify({ detail: "Failed to reach GitHub" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

Deno.serve({ port: 3005, hostname: "0.0.0.0" }, handler);