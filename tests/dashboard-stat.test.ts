import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import express from "express";
import { Pool } from "pg";
import { createServer, type ViteDevServer } from "vite";
import { createProgressRouter } from "../server/progress.js";

const databaseUrl = process.env.DATABASE_URL;
const skipReason =
  process.env.NODE_ENV === "production"
    ? "This integration test must use the development database."
    : !databaseUrl
      ? "DATABASE_URL is required to run this database integration test."
      : false;

test(
  "dashboard displays three workouts dated in the current week",
  { skip: skipReason },
  async () => {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required to run this database integration test.");
    }

    const database = new Pool({ connectionString: databaseUrl });
    let userId: string | undefined;
    let apiServer: Server | undefined;
    let viteServer: ViteDevServer | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>> | undefined;

    try {
      userId = `dashboard-count-test-${randomUUID()}`;
      await database.query(
        "INSERT INTO public.users (id, email) VALUES ($1, $2)",
        [userId, `${userId}@example.invalid`],
      );

      const testWorkouts = [
        { date: "2026-10-18", title: "Before this week" },
        { date: "2026-10-19", title: "Monday workout" },
        { date: "2026-10-21", title: "Wednesday workout" },
        { date: "2026-10-25", title: "Sunday workout" },
        { date: "2026-10-26", title: "Next week" },
      ];
      for (const workout of testWorkouts) {
        await database.query(
          `INSERT INTO public.workouts
             (id, user_id, title, activity_type, performed_on)
           VALUES ($1, $2, $3, 'strength', $4::date)`,
          [randomUUID(), userId, workout.title, workout.date],
        );
      }

      const apiApp = express();
      apiApp.use(
        "/api/progress",
        createProgressRouter(database, (request) => request.get("x-test-user-id") ?? null),
      );
      apiServer = apiApp.listen(0, "127.0.0.1");
      await once(apiServer, "listening");
      const apiAddress = apiServer.address();
      assert.ok(apiAddress && typeof apiAddress !== "string");
      const apiBaseUrl = `http://127.0.0.1:${apiAddress.port}`;

      viteServer = await createServer({
        server: { host: "127.0.0.1", port: 0, strictPort: false },
      });
      await viteServer.listen();
      const viteAddress = viteServer.httpServer?.address();
      assert.ok(viteAddress && typeof viteAddress !== "string");

      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
        args: ["--no-sandbox"],
      });
      page = await browser.newPage({ viewport: { width: 1100, height: 480 } });
      await page.clock.install({ time: new Date("2026-10-25T12:00:00") });

      await page.route("**/api/goals", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ goals: [] }),
        }),
      );
      await page.route("**/api/progress/overview**", async (route) => {
        const requestedUrl = new URL(route.request().url());
        const response = await fetch(
          `${apiBaseUrl}${requestedUrl.pathname}${requestedUrl.search}`,
          { headers: { "x-test-user-id": userId } },
        );
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      });
      await page.route("**/api/progress", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ points: [] }),
        }),
      );

      await page.goto(`http://127.0.0.1:${viteAddress.port}/tests/progress-overview.html`);
      await page.getByText("YOUR TRAINING AT A GLANCE").waitFor();
      const workoutStat = page.locator(".progress-stat-card").first();
      await workoutStat.locator("strong").waitFor();

      const label = (await workoutStat.locator("span").first().textContent())?.trim();
      const count = (await workoutStat.locator("strong").textContent())?.trim();
      assert.match(label ?? "", /WORKOUTS THIS WEEK/i);

      const screenshotPath = process.env.DASHBOARD_TEST_SCREENSHOT;
      if (screenshotPath) {
        await page.screenshot({
          path: resolve(process.cwd(), screenshotPath),
          fullPage: false,
        });
      }

      assert.equal(
        count,
        "3",
        "The dashboard should count only the three workouts within this week.",
      );
    } finally {
      try {
        await page?.close();
        await browser?.close();
        await viteServer?.close();
        if (apiServer?.listening) {
          await new Promise<void>((resolveClose, rejectClose) => {
            apiServer?.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          });
        }
      } finally {
        try {
          if (userId) {
            await database.query("DELETE FROM public.users WHERE id = $1", [userId]);
          }
        } finally {
          await database.end();
        }
      }
    }
  },
);
