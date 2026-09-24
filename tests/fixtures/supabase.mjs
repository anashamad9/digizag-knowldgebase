// Local integration fixture only. Never imported by the application.
import http from "node:http";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "maya@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Maya Ahmad" },
  created_at: "2026-01-01T00:00:00Z",
};
http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3100");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/chat") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.write(JSON.stringify({ type: "delta", text: "Noon GCC" }) + "\n");
      setTimeout(
        () =>
          res.write(
            JSON.stringify({
              type: "delta",
              text: " will pause on 11 October.",
            }) + "\n",
          ),
        600,
      );
      setTimeout(
        () =>
          res.end(
            JSON.stringify({
              type: "done",
              content: "Noon GCC will pause on 11 October.",
              sources: [],
              saved: true,
            }) + "\n",
          ),
        1200,
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (path === "/auth/v1/user") {
      res.end(JSON.stringify(user));
      return;
    }
    if (path === "/auth/v1/logout") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (path === "/auth/v1/token") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const credentials = JSON.parse(body);
      if (
        credentials.email !== user.email ||
        credentials.password !== "fixture-password"
      ) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            code: "invalid_credentials",
            msg: "Invalid login credentials",
          }),
        );
        return;
      }
      const encode = (value) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: 9999999999, role: "authenticated" })}.fixture`;
      res.end(
        JSON.stringify({
          access_token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_in: 3600,
          user,
        }),
      );
      return;
    }
    if (path === "/rest/v1/members") {
      res.end(
        JSON.stringify({
          workspace_id: "00000000-0000-4000-8000-000000000010",
          role: req.headers.authorization?.endsWith("fixture-member")
            ? "member"
            : "owner",
          disabled: false,
        }),
      );
      return;
    }
    if (
      path === "/rest/v1/memories" ||
      path === "/rest/v1/conversations" ||
      path === "/rest/v1/connections"
    ) {
      res.end("[]");
      return;
    }
    if (path === "/") {
      res.end("{}");
      return;
    }
    res.writeHead(404);
    res.end("{}");
  })
  .listen(43219, "127.0.0.1");
