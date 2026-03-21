/**
 * Cloudflare Worker — SeeForMe API Proxy
 * Deploy with: wrangler deploy
 *
 * Routes all /api/* and /ws/* to DigitalOcean backend
 * Adds edge caching for static responses.
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check at edge
    if (url.pathname === "/edge-health") {
      return new Response(JSON.stringify({ status: "ok", edge: "cloudflare" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward to DigitalOcean backend
    const backendUrl = `${env.BACKEND_ORIGIN}${url.pathname}${url.search}`;

    const modifiedRequest = new Request(backendUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    const response = await fetch(modifiedRequest);

    // Add CORS headers at edge
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    newHeaders.set("X-Powered-By", "SeeForMe/Cloudflare");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: newHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
};

interface Env {
  BACKEND_ORIGIN: string;   // e.g. https://your-droplet-ip:8000
}
