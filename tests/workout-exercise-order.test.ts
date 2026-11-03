import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import type { WorkoutDetail, WorkoutInput } from "../client/workoutsApi";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

before(async () => {
  server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox"],
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const template = {
  id: "strength-template",
  name: "Full body",
  activity_type: "strength",
  is_starred: false,
  created_at: "2026-10-20T12:00:00Z",
  items: [
    { id: "bench", position: 1, exercise_name: "Bench press", planned_sets: 2, planned_reps: 8, planned_weight_kg: 60 },
    { id: "squat", position: 2, exercise_name: "Squat", planned_sets: 3, planned_reps: 5, planned_weight_kg: 100 },
    { id: "row", position: 3, exercise_name: "Row", planned_sets: 4, planned_reps: 10, planned_weight_kg: 40 },
  ],
};

async function setup(page: Page) {
  let saved: WorkoutDetail | undefined;
  const writes: WorkoutInput[] = [];
  const templateWrites: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = {};
    if (path === "/api/templates") {
      if (request.method() !== "GET") templateWrites.push(request.method());
      body = { templates: [template] };
    } else if (path.startsWith("/api/templates/")) {
      templateWrites.push(request.method());
    } else if (path === "/api/workouts" || path === "/api/workouts/saved") {
      if (request.method() === "POST" || request.method() === "PUT") {
        const input = request.postDataJSON() as WorkoutInput;
        writes.push(input);
        saved = {
          workout: {
            id: "saved", title: input.title, activity_type: input.activity_type,
            performed_on: input.performed_on, notes: input.notes,
            created_at: "2026-10-20T12:00:00Z",
          },
          sets: input.sets ?? [],
          runDetails: null,
        };
        body = saved;
      } else {
        body = path.endsWith("/saved") ? saved : {
          workouts: saved ? [{
            ...saved.workout, exercise_names: ["Bench press", "Squat", "Row"],
            max_weight_kg: 100, min_weight_kg: 40, distance_km: null,
          }] : [],
        };
      }
    } else if (path === "/api/goals") {
      body = { goals: [] };
    } else if (path.startsWith("/api/progress")) {
      body = { lifts: [], runs: [], stats: { workouts_this_week: 0, heaviest_set_kg: null, longest_run_km: null } };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`${baseUrl}/tests/workouts-responsive.html`);
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await page.getByRole("button", { name: "Save session", exact: true }).waitFor();
  return { writes, templateWrites };
}

async function names(page: Page) {
  return page.locator(".exercise-name input").evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
}

async function drag(page: Page, sourceIndex: number, targetIndex: number) {
  const handle = page.locator(".exercise-order-handle").nth(sourceIndex);
  const target = page.locator(".exercise-row").nth(targetIndex);
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const end = await target.boundingBox();
  assert.ok(start && end);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  const placement = sourceIndex < targetIndex ? "after" : "before";
  await page.mouse.move(end.x + end.width / 2,
    end.y + end.height * (placement === "after" ? 0.8 : 0.2), { steps: 12 });
  assert.equal(await target.getAttribute("data-drop-placement"), placement);
  assert.equal(await page.locator("[data-drop-placement]").count(), 1);
  await page.mouse.up();
  assert.equal(await page.locator("[data-drop-placement]").count(), 0);
}

test("insertion line follows before/after targets and clears on cancellation", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } });
  try {
    await setup(page);
    await page.locator(".exercise-order-handle").first().scrollIntoViewIfNeeded();
    const handle = await page.locator(".exercise-order-handle").first().boundingBox();
    const target = page.locator(".exercise-row").last();
    const rect = await target.boundingBox();
    assert.ok(handle && rect);
    await page.mouse.move(handle.x + 10, handle.y + 10);
    await page.mouse.down();
    await page.mouse.move(rect.x + 60, rect.y + rect.height * 0.2, { steps: 10 });
    assert.equal(await target.getAttribute("data-drop-placement"), "before");
    await page.mouse.move(rect.x + 60, rect.y + rect.height * 0.8, { steps: 5 });
    assert.equal(await target.getAttribute("data-drop-placement"), "after");
    const line = await target.evaluate((row) => {
      const style = getComputedStyle(row, "::after");
      return { height: style.height, width: style.right, color: style.backgroundColor };
    });
    assert.equal(line.height, "4px");
    assert.equal(line.width, "0px");
    assert.equal(line.color, "rgb(185, 241, 108)");
    await page.screenshot({ path: "/tmp/exercise-insertion-line.png" });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("[data-drop-placement]").count(), 0);
    await page.mouse.up();
    assert.deepEqual(await names(page), ["Bench press", "Squat", "Row"]);
    // The upper half of the last row inserts before it, not after it.
    await page.mouse.move(handle.x + 10, handle.y + 10);
    await page.mouse.down();
    await page.mouse.move(rect.x + 60, rect.y + rect.height * 0.2, { steps: 10 });
    await page.mouse.up();
    assert.deepEqual(await names(page), ["Squat", "Bench press", "Row"]);
  } finally {
    await page.close();
  }
});

test("template exercises retain fields and corrections through dragging, saving and editing", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } });
  try {
    const { writes, templateWrites } = await setup(page);
    assert.deepEqual(await names(page), ["Bench press", "Squat", "Row"]);
    // A correction belongs to the stable exercise ID, not its old position.
    await page.getByLabel("Reps per set for exercise 2").fill("");
    await page.getByRole("button", { name: "Save session", exact: true }).click();
    await page.locator(".exercise-row").nth(1).locator('[aria-invalid="true"]').waitFor();
    await page.getByRole("button", { name: "Move Squat up", exact: true }).click();
    assert.deepEqual(await names(page), ["Squat", "Bench press", "Row"]);
    assert.equal(await page.getByLabel("Reps per set for exercise 1").getAttribute("aria-invalid"), "true");
    assert.equal(await page.getByLabel("Reps per set for exercise 2").getAttribute("aria-invalid"), "false");
    await page.getByLabel("Reps per set for exercise 1").fill("5");
    await drag(page, 0, 2);
    assert.deepEqual(await names(page), ["Bench press", "Row", "Squat"]);
    await drag(page, 2, 1);
    assert.deepEqual(await names(page), ["Bench press", "Squat", "Row"]);
    assert.equal(await page.getByLabel("Weight in kg for exercise 2").inputValue(), "100");
    assert.equal(await page.getByLabel("Number of sets for exercise 2", { exact: true }).inputValue(), "3");
    await page.getByRole("button", { name: "Save session", exact: true }).click();
    await page.getByRole("button", { name: "Edit session", exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].sets?.map((set) => set.exercise_name),
      ["Bench press", "Bench press", "Squat", "Squat", "Squat", "Row", "Row", "Row", "Row"]);
    assert.deepEqual(writes[0].sets?.map((set) => set.set_number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await page.getByRole("button", { name: "Edit session", exact: true }).click();
    assert.deepEqual(await names(page), ["Bench press", "Squat", "Row"]);
    await page.getByRole("button", { name: "Drag to reorder Row", exact: true }).focus();
    await page.keyboard.press("ArrowUp");
    assert.deepEqual(await names(page), ["Bench press", "Row", "Squat"]);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("button", { name: "Edit session", exact: true }).waitFor();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].sets?.[2].exercise_name, "Row");
    await page.getByRole("button", { name: /^Open Full body,/ }).click();
    await page.getByRole("button", { name: "Edit session", exact: true }).click();
    assert.deepEqual(await names(page), ["Bench press", "Row", "Squat"]);
    await page.getByRole("button", { name: "Close session form", exact: true }).click();
    // Starting another session from the same template restores its original order.
    await page.getByRole("button", { name: "Use template", exact: true }).click();
    assert.deepEqual(await names(page), ["Bench press", "Squat", "Row"]);
    assert.deepEqual(templateWrites, [], "Session reordering must not update the template.");
  } finally {
    await page.close();
  }
});

test("touch pointer dragging and move buttons work at 320px without overflow", async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 1200 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await setup(page);
    await page.getByRole("button", { name: "Move Row up", exact: true }).click();
    assert.deepEqual(await names(page), ["Bench press", "Row", "Squat"]);
    // Chromium's touchscreen API supports taps only; CDP supplies a real touch drag.
    const handle = page.getByRole("button", { name: "Drag to reorder Row", exact: true });
    await handle.scrollIntoViewIfNeeded();
    const start = await handle.boundingBox();
    const end = await page.locator(".exercise-name input").first().boundingBox();
    assert.ok(start && end);
    const cdp = await context.newCDPSession(page);
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (end.x + 30 - x) * step / 10, y: y + (end.y + 10 - y) * step / 10 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.deepEqual(await names(page), ["Row", "Bench press", "Squat"]);
    assert.equal(await page.getByRole("button", { name: "Move Row up", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Move Squat down", exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Weight in kg for exercise 1").inputValue(), "40");
    assert.equal(await page.getByLabel("Reps per set for exercise 1").inputValue(), "10");
    await page.locator(".exercise-row").first().scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: "/tmp/reorder-session-mobile.png" });
  } finally {
    await context.close();
  }
});
