import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let viteServer: ViteDevServer;
let browser: Browser;
let baseUrl: string;

before(async () => {
  viteServer = await createServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await viteServer.listen();

  const address = viteServer.httpServer?.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox"],
  });
});

after(async () => {
  await browser?.close();
  await viteServer?.close();
});

test("search and all six sort modes work on a narrow screen", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  const workouts = [
    {
      id: "lift-heavy",
      title: "Leg strength",
      activity_type: "strength",
      performed_on: "2026-10-20",
      notes: null,
      created_at: "2026-10-20T08:00:00.000Z",
      exercise_names: ["Squat"],
      max_weight_kg: 140,
      min_weight_kg: 30,
      distance_km: null,
    },
    {
      id: "lift-light",
      title: "Upper body",
      activity_type: "strength",
      performed_on: "2026-10-23",
      notes: null,
      created_at: "2026-10-23T08:00:00.000Z",
      exercise_names: ["Bench press"],
      max_weight_kg: 90,
      min_weight_kg: 15,
      distance_km: null,
    },
    {
      id: "run-long",
      title: "Long run",
      activity_type: "run",
      performed_on: "2026-10-22",
      notes: "Easy effort",
      created_at: "2026-10-22T08:00:00.000Z",
      exercise_names: [],
      max_weight_kg: null,
      min_weight_kg: null,
      distance_km: 12,
    },
    {
      id: "run-short",
      title: "Recovery miles",
      activity_type: "run",
      performed_on: "2026-10-19",
      notes: null,
      created_at: "2026-10-19T08:00:00.000Z",
      exercise_names: [],
      max_weight_kg: null,
      min_weight_kg: null,
      distance_km: 5,
    },
  ];

  try {
    await page.route("**/api/workouts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workouts }),
      }),
    );
    await page.goto(`${baseUrl}/tests/workouts-responsive.html`);
    await page.getByRole("search", { name: "Search and filter sessions" }).waitFor();

    await page.getByLabel("Exercise or workout").fill("sQuAt");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Leg strength"],
    );

    await page.getByLabel("Exercise or workout").fill("");
    await page.getByLabel("Activity").selectOption("strength");
    const sortSelect = page.getByLabel("Sort by");
    assert.deepEqual(
      await sortSelect.locator("option").evaluateAll((options) =>
        options.map((option) => option.textContent?.trim()),
      ),
      ["Newest first", "Oldest first", "Highest weight", "Lowest weight"],
    );
    await sortSelect.selectOption("newest");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Upper body", "Leg strength"],
    );
    await sortSelect.selectOption("oldest");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Leg strength", "Upper body"],
    );
    await sortSelect.selectOption("highest-weight");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Leg strength", "Upper body"],
    );
    await sortSelect.selectOption("lowest-weight");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Upper body", "Leg strength"],
    );

    await page.getByLabel("Activity").selectOption("run");
    assert.deepEqual(
      await sortSelect.locator("option").evaluateAll((options) =>
        options.map((option) => option.textContent?.trim()),
      ),
      ["Newest first", "Oldest first", "Farthest distance", "Shortest distance"],
    );
    await sortSelect.selectOption("farthest");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Long run", "Recovery miles"],
    );
    await sortSelect.selectOption("shortest");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Recovery miles", "Long run"],
    );

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(dimensions.width, 320);
    assert.ok(dimensions.scrollWidth <= dimensions.width, "Search and sort controls should not overflow the page.");
  } finally {
    await page.close();
  }
});
