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

test("progress overview shows weekly stats and selectable lift and run charts on mobile", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  const overview = {
    stats: {
      workouts_this_week: 3,
      heaviest_set: {
        exercise_name: "Squat",
        weight_kg: 145.5,
        reps: 5,
        performed_on: "2026-10-21",
      },
      longest_run: {
        distance_km: 13.25,
        performed_on: "2026-10-20",
      },
    },
    lift_points: [
      {
        workout_id: "lift-a",
        performed_on: "2026-10-20",
        exercise_name: "Squat",
        weight_kg: 135,
        reps: 5,
        set_number: 1,
      },
      {
        workout_id: "lift-a",
        performed_on: "2026-10-20",
        exercise_name: "Squat",
        weight_kg: 145.5,
        reps: 3,
        set_number: 2,
      },
      {
        workout_id: "lift-b",
        performed_on: "2026-10-22",
        exercise_name: "Bench press",
        weight_kg: 60,
        reps: 8,
        set_number: 1,
      },
    ],
    run_points: [
      {
        workout_id: "run-a",
        performed_on: "2026-10-20",
        distance_km: 13.25,
        pace_seconds_per_km: 330,
      },
      {
        workout_id: "run-b",
        performed_on: "2026-10-23",
        distance_km: 5,
        pace_seconds_per_km: 360,
      },
    ],
  };

  try {
    await page.route("**/api/goals", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ goals: [] }),
      }),
    );
    await page.route("**/api/progress/overview**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overview),
      }),
    );
    await page.route("**/api/progress", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ points: [] }),
      }),
    );
    await page.goto(`${baseUrl}/tests/progress-overview.html`);
    await page.getByText("YOUR TRAINING AT A GLANCE").waitFor();
    await page.locator(".progress-stat-card").first().waitFor();

    assert.equal(await page.locator(".progress-stat-card").nth(0).locator("strong").textContent(), "3");
    assert.equal(await page.locator(".progress-stat-card").nth(1).locator("strong").textContent(), "320.8 lb");
    assert.equal(await page.locator(".progress-stat-card").nth(2).locator("strong").textContent(), "8.2 mi");

    await page.getByLabel("Selected lift").selectOption("Squat");
    await page.getByRole("region", { name: "Top weight · lb chart" }).waitFor();
    await page.getByRole("region", { name: "Reps chart" }).waitFor();
    await page.getByRole("region", { name: "Distance · mi chart" }).waitFor();
    await page.getByRole("region", { name: "Pace · min:sec / mi chart" }).waitFor();
    assert.match(await page.getByText("Add a lift or run goal to compare your training with a target.").textContent() ?? "", /Add a lift/);

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(dimensions.width, 320);
    assert.ok(dimensions.scrollWidth <= dimensions.width, "The overview should not create horizontal page scrolling.");
  } finally {
    await page.close();
  }
});
