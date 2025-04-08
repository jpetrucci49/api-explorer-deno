# API Explorer Deno Backend

A RESTful API built with Deno to fetch and cache GitHub user data. Integrates with the [API Explorer Frontend](https://github.com/jpetrucci49/api-explorer-frontend).

## Features

- Endpoint: `/github?username={username}`
- Returns GitHub user details (e.g., login, id, name, repos, followers).
- Redis caching with 30-minute TTL.
- Logs requests with cache status and duration.

## Setup

1. **Clone the repo**  
   ```bash
   git clone https://github.com/jpetrucci49/api-explorer-deno.git
   cd api-explorer-deno
   ```
2. **Install dependencies**  
   ```bash
   # None needed - Deno handles imports inline
   ```
3. **Run locally**  
   ```bash
   make dev
   ```
   Runs on `http://localhost:3005`. Requires Redis at `redis:6379`.  
   *Note*: If `make` isn’t installed:  
   ```bash
   deno run --allow-net --allow-env main.ts
   ```

## Usage

- GET `/github?username=octocat` to fetch data for "octocat".
- Test with `curl -v` (check `X-Cache`) or the frontend.

## Example Response

```json
{
  "login": "octocat",
  "id": 583231,
  "name": "The Octocat",
  "public_repos": 8,
  "followers": 17529
}
```

## Next Steps

- Add `/analyze` endpoint for profile insights (e.g., language stats).
- Add `/network` endpoint for collaboration mapping.
- Deploy to Deno Deploy.

---
Built by Joseph Petrucci | March 2025