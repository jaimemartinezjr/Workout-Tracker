import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
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

async function openWorkoutForm(page: Page) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route("**/api/workouts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ workouts: [] }),
    }),
  );
  await page.goto(`${baseUrl}/tests/workouts-responsive.html`);
  await page.getByRole("button", { name: "Log your first session" }).click();
  await page.getByRole("button", { name: "Save session" }).waitFor();
}

async function assertMessagesFitWithoutOverlappingControls(
  page: Page,
  messageSelector: string,
  controlSelector: string,
) {
  const result = await page.locator(messageSelector).evaluateAll((messages, selector) => {
    return messages.map((message) => {
      const bounds = message.getBoundingClientRect();
      const field = message.closest(".exercise-field, .workout-field");
      const group = message.closest(".exercise-row, .run-fields") ?? field;
      const fieldBounds = field?.getBoundingClientRect();
      const controls = Array.from(group?.querySelectorAll(selector) ?? []);
      const ownInput = field?.querySelector("input, select, textarea");
      const overlap = controls
        .filter((control) => control !== ownInput)
        .some((control) => {
          const controlBounds = control.getBoundingClientRect();
          return bounds.left < controlBounds.right
            && bounds.right > controlBounds.left
            && bounds.top < controlBounds.bottom
            && bounds.bottom > controlBounds.top;
        });

      return {
        text: message.textContent?.trim(),
        width: bounds.width,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        fieldLeft: fieldBounds?.left,
        fieldRight: fieldBounds?.right,
        fieldBottom: fieldBounds?.bottom,
        scrollWidth: message.scrollWidth,
        clientWidth: message.clientWidth,
        overlap,
        inputBottom: ownInput?.getBoundingClientRect().bottom,
      };
    });
  }, controlSelector);

  assert.ok(result.length > 0, `Expected correction messages matching ${messageSelector}`);
  for (const message of result) {
    assert.ok(message.text, "Correction message text should be present.");
    assert.ok(message.width > 0 && message.height > 0, "Correction message should have visible dimensions.");
    assert.ok(message.left >= (message.fieldLeft ?? 0) - 1, "Correction message should stay within its field.");
    assert.ok(message.right <= (message.fieldRight ?? 0) + 1, "Correction message should not overflow its field.");
    assert.ok(message.bottom <= (message.fieldBottom ?? 0) + 1, "Correction message should not be clipped by its field.");
    assert.ok(message.scrollWidth <= message.clientWidth + 1, "Correction text should wrap instead of overflowing horizontally.");
    assert.ok(!message.overlap, "Correction message should not overlap a neighboring control.");
    if (message.inputBottom !== undefined) {
      assert.ok(message.top >= message.inputBottom - 1, "Correction message should appear below its input.");
    }
  }
}

test("strength correction messages wrap inside exercise cards at 320px", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  try {
    await openWorkoutForm(page);
    await page.getByLabel("Session name").fill("Mobile strength");
    await page.getByRole("button", { name: "Save session" }).click();

    const errors = page.locator(".exercise-field-error");
    await errors.first().waitFor();
    assert.equal(await errors.count(), 3);
    await assertMessagesFitWithoutOverlappingControls(
      page,
      ".exercise-field-error",
      "input, button",
    );
    const heights = await errors.evaluateAll((messages) =>
      messages.map((message) => message.getBoundingClientRect().height),
    );
    assert.ok(heights.some((height) => height > 16), "At least one exercise correction should wrap onto multiple lines.");

    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(pageWidth, 320);
    assert.ok(pageScrollWidth <= pageWidth, "The form should not create horizontal page scrolling.");
  } finally {
    await page.close();
  }
});

test("run correction messages wrap below their controls at 320px", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  try {
    await openWorkoutForm(page);
    await page.getByLabel("Session name").fill("Mobile run");
    await page.getByLabel("Activity").selectOption("run");
    await page.getByRole("button", { name: "Save session" }).click();

    const errors = page.locator(".workout-field-error");
    await errors.first().waitFor();
    assert.equal(await errors.count(), 3);
    await assertMessagesFitWithoutOverlappingControls(
      page,
      ".workout-field-error",
      "input, select, textarea, button",
    );
    const runMessages = await errors.evaluateAll((messages) =>
      messages.map((message) => ({
        text: message.textContent?.trim(),
        height: message.getBoundingClientRect().height,
      })),
    );
    assert.ok(runMessages.some(({ height }) => height > 16), "At least one run correction should wrap onto multiple lines.");
    assert.ok(runMessages.every(({ text }) => text), "Each run correction should remain readable.");

    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(pageWidth, 320);
    assert.ok(pageScrollWidth <= pageWidth, "The form should not create horizontal page scrolling.");
  } finally {
    await page.close();
  }
});

test("workout search and filters remain usable at 320px", async () => {
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
      distance_km: null,
    },
    {
      id: "lift-upper",
      title: "Upper body",
      activity_type: "strength",
      performed_on: "2026-10-23",
      notes: null,
      created_at: "2026-10-23T08:00:00.000Z",
      exercise_names: ["Bench press"],
      max_weight_kg: 100,
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
      distance_km: 12,
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
    assert.match(await page.locator(".workouts-count").textContent() ?? "", /^1 of 3/);

    await page.getByLabel("Exercise or workout").fill("");
    await page.getByLabel("Activity").selectOption("strength");
    await page.getByLabel("Sort by").selectOption("weight");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Leg strength", "Upper body"],
    );

    await page.getByLabel("Activity").selectOption("run");
    await page.getByLabel("Sort by").selectOption("distance");
    assert.deepEqual(
      await page.locator(".workout-row-copy strong").allTextContents(),
      ["Long run"],
    );

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      historyWidth: document.querySelector(".workout-history")?.clientWidth ?? 0,
      historyScrollWidth: document.querySelector(".workout-history")?.scrollWidth ?? 0,
    }));
    assert.equal(dimensions.width, 320);
    assert.ok(dimensions.scrollWidth <= dimensions.width, "History filters should not create horizontal page scrolling.");
    assert.ok(
      dimensions.historyScrollWidth <= dimensions.historyWidth + 1,
      "History filters should fit inside the workout history panel.",
    );
  } finally {
    await page.close();
  }
});
