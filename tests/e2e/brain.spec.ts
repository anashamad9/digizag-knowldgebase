import { test, expect, type BrowserContext } from "@playwright/test";
async function signIn(context: BrowserContext, member = false) {
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "00000000-0000-4000-8000-000000000001", exp: 9999999999, role: "authenticated" })}.${member ? "fixture-member" : "fixture"}`;
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${encode({ access_token: token, refresh_token: "fixture", expires_at: 9999999999, token_type: "bearer", user: { id: "00000000-0000-4000-8000-000000000001" } })}`,
      domain: "localhost",
      path: "/",
    },
  ]);
}
test("password login rejects invalid credentials then opens the workspace without email", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/memory")).status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  let emailRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/auth/v1/otp")) emailRequests++;
  });
  await page.getByLabel("Work email").fill("maya@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Could not sign in. Check your email and password."),
  ).toBeVisible();
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.screenshot({ path: "artifacts/login.png" });
  const sent = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/token?grant_type=password"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    email: "maya@example.com",
    password: "fixture-password",
  });
  await expect(
    page.getByRole("textbox", { name: "Message Brain" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Maya Ahmad", { exact: true })).toBeVisible();
  expect(emailRequests).toBe(0);
});
test("compact coss UI, pure black, collapsible sidebar, mobile navigation and logout", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/");
  await expect(page.getByText("Maya Ahmad", { exact: true })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New chat" })).toHaveAttribute(
    "data-slot",
    "button",
  );
  await expect(page.locator("aside")).toHaveCSS("width", "256px");
  expect(
    (await page.getByRole("button", { name: "New chat" }).boundingBox())!
      .height,
  ).toBeLessThanOrEqual(32);
  await expect(
    page.getByRole("status", { name: "Loading workspace" }),
  ).toHaveCount(0);
  await page.screenshot({ path: "artifacts/chat-light.png" });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await page.screenshot({ path: "artifacts/chat-dark.png" });
  await page.getByRole("button", { name: "Close sidebar" }).click();
  await expect(page.locator("aside")).toHaveCSS("width", "0px");
  await expect(page.locator("aside")).toHaveCSS("border-right-width", "0px");
  await expect(page.locator("aside").getByRole("button")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page.screenshot({ path: "artifacts/sidebar-closed.png" });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open sidebar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Apps", exact: true }).click();
  await expect(page.getByText("Not connected")).toHaveCount(2);
  await expect(page.locator('img[src*="pumble.svg"]')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("main img")
        .evaluateAll((imgs) =>
          imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/apps-dark.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Data", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search memory" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: "artifacts/data-mobile.png" });
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out" })
    .click();
  await expect(page).toHaveURL(/login/);
});
test("privacy is sent with each message and output arrives incrementally", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.route("**/api/chat", (route) =>
    route.continue({ url: "http://127.0.0.1:43219/chat" }),
  );
  await page.goto("/");
  const privacy = page.getByRole("button", {
    name: "Share saved information with team",
  });
  await expect(privacy).toContainText("Only me");
  await privacy.click();
  await page
    .getByRole("textbox", { name: "Message Brain" })
    .fill("Noon GCC will pause on 11 October.");
  const sent = page.waitForRequest((r) => r.url().includes("/api/chat"));
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await sent).postDataJSON().visibility).toBe("workspace");
  await expect(page.locator("article[data-role=assistant]")).toContainText(
    "Noon GCC",
  );
  await expect(page.getByLabel("Generating response")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Generating response")).toHaveCount(0);
  await expect(page.locator("aside")).toContainText("Noon GCC will pause");
  await privacy.click();
  await page
    .getByRole("textbox", { name: "Message Brain" })
    .fill("Private update");
  const privateRequest = page.waitForRequest((r) =>
    r.url().includes("/api/chat"),
  );
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await privateRequest).postDataJSON().visibility).toBe("private");
});

test("chat and file deletion require confirmation and remove the visible records", async ({
  page,
  context,
}) => {
  await signIn(context);
  const chatId = "00000000-0000-4000-8000-000000000501";
  const fileId = "00000000-0000-4000-8000-000000000502";
  let chats = [
    {
      id: chatId,
      title: "Partner review",
      messages: [],
      updated_at: new Date().toISOString(),
    },
  ];
  let memories = [
    {
      id: fileId,
      title: "payout.xlsx",
      content: "Partner 14534",
      source: "file",
      created_at: new Date().toISOString(),
      visibility: "private",
      owner_id: "00000000-0000-4000-8000-000000000001",
      metadata: {
        filename: "payout.xlsx",
        storage_path: "test/payout.xlsx",
        indexed: true,
      },
    },
  ];
  let deletions = 0;
  let memoryReads = 0;
  await page.route("**/api/memory*", async (route) => {
    if (route.request().method() === "DELETE") {
      deletions++;
      memories = [];
      await route.fulfill({ json: { ok: true } });
      return;
    }
    memoryReads++;
    await route.fulfill({ json: { memories, conversations: chats } });
  });
  await page.route("**/api/conversations", async (route) => {
    expect(route.request().postDataJSON().id).toBe(chatId);
    deletions++;
    chats = [];
    memories = [];
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Partner review", exact: true })
    .hover();
  await page
    .getByRole("button", { name: "Chat options: Partner review" })
    .click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await expect(page.getByRole("dialog")).toContainText("saved facts");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deletions).toBe(0);
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete payout.xlsx", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByText("No memories yet.")).toBeVisible();
  const readsBeforeChatDelete = memoryReads;
  await page
    .getByRole("button", { name: "Chat options: Partner review" })
    .click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Partner review", exact: true }),
  ).toHaveCount(0);
  expect(deletions).toBe(2);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  expect(memoryReads).toBe(readsBeforeChatDelete);
});

test("owner users screen shows last login and saves updates; anonymous users cannot administer", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/users")).status()).toBe(401);
  await signIn(context);
  let user = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Ahmad",
    email: "ahmad@example.com",
    role: "member",
    disabled: false,
    last_login: "2026-09-22T10:00:00Z",
    created_at: "2026-09-01T10:00:00Z",
  };
  await page.route("**/api/users*", async (route) => {
    if (route.request().method() === "PATCH")
      user = { ...user, ...route.request().postDataJSON() };
    await route.fulfill({
      json:
        route.request().method() === "GET"
          ? { users: [user], total: 1, page: 1 }
          : { ok: true },
    });
  });
  await page.goto("/?page=users");
  await expect(
    page.getByRole("columnheader", { name: "Last login" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Ahmad Ali");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Ahmad Ali");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Suspended");
  await page.screenshot({ path: "artifacts/users.png" });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Permanently delete ahmad@example.com",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("ordinary members cannot access owner UI or management endpoints", async ({
  page,
  context,
}) => {
  await signIn(context, true);
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Message Brain" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Users", exact: true }),
  ).toHaveCount(0);
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const response = await page.request.fetch("/api/users", {
      method,
      ...(method !== "GET" ? { data: {} } : {}),
    });
    expect(response.status()).toBe(403);
  }
});

test("sync continues automatically through batches and email opens as readable text", async ({
  page,
  context,
}) => {
  await signIn(context);
  const memory = {
    id: "00000000-0000-4000-8000-000000000502",
    title: "Campaign update",
    source: "gmail",
    content:
      "Hello team,\n\nCampaign pauses in October.\n\n[image: logo] <https://example.com/very/long/link>\n\nOn Tuesday, Ahmad wrote:\n> Previous message",
    visibility: "workspace",
    owner_id: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-09-22T10:00:00Z",
    metadata: {
      from: "Ahmad <ahmad@example.com>",
      to: "Team <team@example.com>",
      date: "22 Sep 2026",
    },
  };
  await page.route("**/api/memory*", (route) =>
    route.fulfill({
      json: route.request().url().includes("?id=")
        ? { memory }
        : { memories: [memory], conversations: [] },
    }),
  );
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: {
        connections: [
          { id: "gmail-test", provider: "gmail", status: "ACTIVE" },
        ],
      },
    }),
  );
  let runs = 0;
  await page.route("**/api/sync", async (route) => {
    runs++;
    await route.fulfill({ json: { count: 15, more: runs < 3 } });
  });
  await page.goto("/?page=apps");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect.poll(() => runs).toBe(3);
  await expect(
    page.getByText("45 items processed. Sync complete."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Team");
  await page
    .getByRole("button", { name: "Campaign update", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Email", exact: true });
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog).toContainText("Ahmad <ahmad@example.com>");
  await expect(dialog).toContainText("Campaign pauses in October.");
  await expect(dialog.getByText(/Previous message/)).toHaveCount(0);
  await expect(
    dialog.getByRole("link", { name: "example.com" }),
  ).toHaveAttribute("href", "https://example.com/very/long/link");
  await dialog
    .getByRole("button", { name: "Show quoted conversation" })
    .click();
  await expect(dialog).toContainText("Previous message");
  await dialog.getByRole("button", { name: "Edit text" }).click();
  await expect(dialog.getByLabel("Content", { exact: true })).toHaveValue(
    memory.content,
  );
  await dialog.getByRole("button", { name: "Preview", exact: true }).click();
  await page.screenshot({ path: "artifacts/email.png" });
});

test("Pumble skips blocked channels and reports partial sync persistently", async ({
  page,
  context,
}) => {
  await signIn(context);
  const warning =
    "Skipped #digizag-family: Pumble denied access. Private channels require the API add-on bot as a member. Check channel access, then select Sync to retry.";
  let calls = 0;
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: {
        connections: [
          {
            id: "pumble-test",
            provider: "pumble",
            status: "ACTIVE",
            error: calls ? warning : null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/sync", async (route) => {
    calls++;
    await route.fulfill({
      json: { count: calls === 1 ? 0 : 3, more: calls === 1, warning },
    });
  });
  await page.goto("/?page=apps");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByText("Partial sync", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("API add-on bot");
  await expect(
    page.getByText(/3 items processed. Sync finished with skipped channels/),
  ).toBeVisible();
  await expect(page.getByText("Sync complete.", { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole("table")).toContainText("#digizag-family");
});

test("owner saves general business rules and members cannot modify them", async ({
  page,
  context,
}) => {
  await signIn(context);
  let content = "";
  await page.route("**/api/knowledge-rules", async (route) => {
    if (route.request().method() === "PUT")
      content = route.request().postDataJSON().content;
    await route.fulfill({
      json: route.request().method() === "GET" ? { content } : { ok: true },
    });
  });
  await page.goto("/?page=settings");
  await page
    .getByLabel("Business rules")
    .fill(
      "Only explicit decisions replace proposals. Atlas and Project A are the same project.",
    );
  await page.getByRole("button", { name: "Save rules", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
  expect(content).toContain("Atlas");
  await page.screenshot({ path: "artifacts/business-rules.png" });
  await signIn(context, true);
  await page.reload();
  await expect(page.getByLabel("Business rules")).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(
    page.getByRole("button", { name: "Save rules", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.put("/api/knowledge-rules", {
        data: { content: "forged" },
      })
    ).status(),
  ).toBe(403);
});

test("Pumble source shows sender, channel and original local date with timezone", async ({
  page,
  context,
}) => {
  await signIn(context);
  const memory = {
    id: "00000000-0000-4000-8000-000000000601",
    title: "#operations · Ahmad",
    source: "pumble",
    content: "Project Atlas has a new deadline.",
    created_at: "2026-10-01T00:00:00Z",
    visibility: "private",
    owner_id: "00000000-0000-4000-8000-000000000001",
    metadata: {
      author: "Ahmad",
      channel: "operations",
      datetime: 1790072130000,
      edited: true,
      thread_reply: { root: "r1" },
    },
  };
  await page.route("**/api/memory*", (route) =>
    route.fulfill({
      json: route.request().url().includes("?id=")
        ? { memory }
        : { memories: [memory], conversations: [] },
    }),
  );
  await page.goto("/?page=data");
  await page.getByRole("button", { name: memory.title, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Pumble message",
    exact: true,
  });
  await expect(dialog).toContainText("Ahmad");
  await expect(dialog).toContainText("#operations");
  await expect(dialog).toContainText("Edited");
  await expect(dialog).toContainText("Thread reply");
  await expect(dialog.locator("time")).toHaveAttribute(
    "datetime",
    new Date(memory.metadata.datetime).toISOString(),
  );
  await expect(dialog.locator("time")).toContainText("2026");
  await expect(dialog.locator("time")).not.toContainText("Oct");
  await page.screenshot({ path: "artifacts/pumble-message.png" });
  await dialog.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(dialog.getByLabel("Content", { exact: true })).toHaveValue(
    memory.content,
  );
});

test("data sorts imported messages by sent date and labels their dates", async ({
  page,
  context,
}) => {
  await signIn(context);
  const base = {
    content: "message",
    visibility: "private",
    owner_id: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-10-01T00:00:00Z",
  };
  const memories = [
    {
      ...base,
      id: "old",
      title: "Older email",
      source: "gmail",
      metadata: { date: "2026-09-01T10:00:00Z" },
    },
    {
      ...base,
      id: "unknown",
      title: "Undated email",
      source: "gmail",
      metadata: {},
    },
    {
      ...base,
      id: "new",
      title: "Newest message",
      source: "pumble",
      created_at: "2026-09-22T00:00:00Z",
      metadata: { datetime: "2026-09-22T10:15:00Z" },
    },
  ];
  await page.route("**/api/memory*", (route) =>
    route.fulfill({ json: { memories, conversations: [] } }),
  );
  await page.goto("/?page=data");
  const rows = page.locator("tbody tr");
  await expect(rows.nth(0)).toContainText("Newest message");
  await expect(rows.nth(1)).toContainText("Older email");
  await expect(rows.nth(2)).toContainText("Date unavailable");
  await expect(rows.nth(0).locator("time")).toHaveAttribute(
    "datetime",
    "2026-09-22T10:15:00.000Z",
  );
  await page.getByRole("tab", { name: "Gmail", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Sent", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("Older email");
});
