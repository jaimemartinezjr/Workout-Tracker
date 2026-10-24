import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { createTemplatesRouter, type TemplatesDatabase } from "./templates.js";

type TemplateRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  name: string;
  activity_type: string;
  created_at: string;
};

type ItemRow = Record<string, unknown> & {
  id: string;
  template_id: string;
  position: number;
};

class MemoryTemplatesDatabase implements TemplatesDatabase {
  readonly templates: TemplateRow[];
  readonly items: ItemRow[];
  commits = 0;
  connects = 0;

  constructor(templates: TemplateRow[] = [], items: ItemRow[] = []) {
    this.templates = templates;
    this.items = items;
  }

  async query(text: string, values: unknown[] = []) {
    const sql = text.replace(/\s+/g, " ");
    if (sql.includes("FROM public.template_items")) {
      const ownedTemplateIds = new Set(
        this.templates
          .filter((template) => template.user_id === values[0])
          .map((template) => template.id),
      );
      const rows = this.items
        .filter((item) => ownedTemplateIds.has(item.template_id))
        .sort((left, right) =>
          left.template_id.localeCompare(right.template_id) ||
          left.position - right.position,
        );
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM public.templates") && sql.includes("SELECT")) {
      const rows = this.templates.filter((item) => item.user_id === values[0]);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("DELETE FROM public.templates")) {
      const [id, userId] = values;
      const index = this.templates.findIndex(
        (template) => template.id === id && template.user_id === userId,
      );
      if (index === -1) return { rows: [], rowCount: 0 };
      const [template] = this.templates.splice(index, 1);
      for (let itemIndex = this.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        if (this.items[itemIndex].template_id === template.id) {
          this.items.splice(itemIndex, 1);
        }
      }
      return { rows: [{ id: template.id }], rowCount: 1 };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  }

  async connect() {
    this.connects += 1;
    return {
      query: async (text: string, values: unknown[] = []) => {
        const sql = text.replace(/\s+/g, " ");
        if (sql === "BEGIN") return { rows: [], rowCount: 0 };
        if (sql === "COMMIT") {
          this.commits += 1;
          return { rows: [], rowCount: 0 };
        }
        if (sql === "ROLLBACK") return { rows: [], rowCount: 0 };
        if (sql.includes("INSERT INTO public.templates")) {
          const [id, userId, name, activityType] = values;
          const row: TemplateRow = {
            id: String(id),
            user_id: String(userId),
            name: String(name),
            activity_type: String(activityType),
            created_at: "2026-10-24T00:00:00.000Z",
          };
          this.templates.unshift(row);
          return { rows: [row], rowCount: 1 };
        }
        if (sql.includes("UPDATE public.templates")) {
          const [id, userId, name, activityType] = values;
          const template = this.templates.find(
            (item) => item.id === id && item.user_id === userId,
          );
          if (!template) return { rows: [], rowCount: 0 };
          template.name = String(name);
          template.activity_type = String(activityType);
          return { rows: [template], rowCount: 1 };
        }
        if (sql.includes("DELETE FROM public.template_items")) {
          const [templateId] = values;
          for (let index = this.items.length - 1; index >= 0; index -= 1) {
            if (this.items[index].template_id === templateId) this.items.splice(index, 1);
          }
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO public.template_items")) {
          const isRunItem = !sql.includes("exercise_name");
          const [id, templateId, position, ...rest] = isRunItem
            ? [values[0], values[1], 1, ...values.slice(2)]
            : values;
          const row: ItemRow = {
            id: String(id),
            template_id: String(templateId),
            position: Number(position),
            exercise_name: null,
            planned_sets: null,
            planned_reps: null,
            planned_weight_kg: null,
            planned_distance_km: null,
            planned_pace_seconds_per_km: null,
          };
          if (isRunItem) {
            row.planned_distance_km = rest[0];
            row.planned_pace_seconds_per_km = rest[1];
          } else {
            [
              row.exercise_name,
              row.planned_sets,
              row.planned_reps,
              row.planned_weight_kg,
            ] = rest;
          }
          this.items.push(row);
          return { rows: [row], rowCount: 1 };
        }
        throw new Error(`Unexpected client query: ${sql}`);
      },
      release: () => undefined,
    };
  }
}

async function withTestApp(
  database: TemplatesDatabase,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/templates",
    createTemplatesRouter(database, (request) => request.header("x-test-user-id") ?? null),
  );

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("template routes require a signed-in user", async () => {
  await withTestApp(new MemoryTemplatesDatabase(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/templates`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Sign in to manage your templates.",
    });
  });
});

test("users only receive their own templates and template items", async () => {
  const database = new MemoryTemplatesDatabase(
    [
      {
        id: "template-a",
        user_id: "user-a",
        name: "Upper body",
        activity_type: "strength",
        created_at: "2026-10-24T00:00:00.000Z",
      },
    ],
    [
      {
        id: "item-a",
        template_id: "template-a",
        position: 1,
        exercise_name: "Bench press",
        planned_sets: 3,
        planned_reps: 5,
        planned_weight_kg: "100.5",
        planned_distance_km: null,
        planned_pace_seconds_per_km: null,
      },
    ],
  );

  await withTestApp(database, async (baseUrl) => {
    const otherUserResponse = await fetch(`${baseUrl}/api/templates`, {
      headers: { "x-test-user-id": "user-b" },
    });
    assert.equal(otherUserResponse.status, 200);
    assert.deepEqual(await otherUserResponse.json(), { templates: [] });

    const ownerResponse = await fetch(`${baseUrl}/api/templates`, {
      headers: { "x-test-user-id": "user-a" },
    });
    assert.equal(ownerResponse.status, 200);
    const payload = await ownerResponse.json() as {
      templates: Array<{ id: string; items: Array<{ planned_weight_kg: number }> }>;
    };
    assert.equal(payload.templates.length, 1);
    assert.equal(payload.templates[0].items[0].planned_weight_kg, 100.5);
  });
});

test("owners can create strength and running templates with ordered items", async () => {
  const database = new MemoryTemplatesDatabase();
  await withTestApp(database, async (baseUrl) => {
    const headers = {
      "content-type": "application/json",
      "x-test-user-id": "user-a",
    };
    const strengthResponse = await fetch(`${baseUrl}/api/templates`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Upper body",
        activity_type: "strength",
        items: [
          {
            exercise_name: "Bench press",
            planned_sets: 3,
            planned_reps: 5,
            planned_weight_kg: 100.5,
          },
          {
            exercise_name: "Row",
            planned_sets: 4,
            planned_reps: 8,
            planned_weight_kg: 50,
          },
        ],
      }),
    });
    assert.equal(strengthResponse.status, 201);
    const strength = await strengthResponse.json() as {
      template: {
        id: string;
        items: Array<{ id: string; position: number; exercise_name: string }>;
      };
    };
    assert.equal(strength.template.items.length, 2);
    assert.deepEqual(
      strength.template.items.map(({ position, exercise_name }) => [position, exercise_name]),
      [[1, "Bench press"], [2, "Row"]],
    );
    assert.ok(strength.template.items.every((item) => item.id));

    const runResponse = await fetch(`${baseUrl}/api/templates`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Easy five miles",
        activity_type: "run",
        items: [{ planned_distance_km: 8.04672, planned_pace_seconds_per_km: 335 }],
      }),
    });
    assert.equal(runResponse.status, 201);
    const run = await runResponse.json() as {
      template: { activity_type: string; items: Array<{ planned_distance_km: number }> };
    };
    assert.equal(run.template.activity_type, "run");
    assert.equal(run.template.items[0].planned_distance_km, 8.047);
    assert.equal(database.connects, 2);
    assert.equal(database.commits, 2);
  });
});

test("template validation rejects incomplete data before opening a transaction", async () => {
  const database = new MemoryTemplatesDatabase();
  await withTestApp(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/templates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": "user-a",
      },
      body: JSON.stringify({
        name: "Incomplete",
        activity_type: "strength",
        items: [{ exercise_name: "Squat", planned_sets: 0, planned_reps: 5, planned_weight_kg: 80 }],
      }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Enter a whole number of sets from 1 to 100.",
    });
    assert.equal(database.connects, 0);
    assert.equal(database.templates.length, 0);
  });
});

test("owners can update a template and its ordered items without changing another user's template", async () => {
  const database = new MemoryTemplatesDatabase(
    [
      {
        id: "template-a",
        user_id: "user-a",
        name: "Upper body",
        activity_type: "strength",
        created_at: "2026-10-24T00:00:00.000Z",
      },
      {
        id: "template-b",
        user_id: "user-b",
        name: "Their routine",
        activity_type: "strength",
        created_at: "2026-10-23T00:00:00.000Z",
      },
    ],
    [
      {
        id: "item-a1",
        template_id: "template-a",
        position: 1,
        exercise_name: "Bench press",
        planned_sets: 3,
        planned_reps: 5,
        planned_weight_kg: 100,
      },
      {
        id: "item-a2",
        template_id: "template-a",
        position: 2,
        exercise_name: "Row",
        planned_sets: 4,
        planned_reps: 8,
        planned_weight_kg: 50,
      },
      {
        id: "item-b1",
        template_id: "template-b",
        position: 1,
        exercise_name: "Squat",
        planned_sets: 3,
        planned_reps: 8,
        planned_weight_kg: 80,
      },
    ],
  );
  const updateInput = {
    name: "Updated upper body",
    activity_type: "strength",
    items: [
      {
        exercise_name: "Row",
        planned_sets: 5,
        planned_reps: 10,
        planned_weight_kg: 55,
      },
      {
        exercise_name: "Bench press",
        planned_sets: 4,
        planned_reps: 6,
        planned_weight_kg: 105,
      },
    ],
  };
  const headers = {
    "content-type": "application/json",
    "x-test-user-id": "user-a",
  };

  await withTestApp(database, async (baseUrl) => {
    const unauthorizedResponse = await fetch(`${baseUrl}/api/templates/template-a`, {
      method: "PUT",
      headers: { ...headers, "x-test-user-id": "user-b" },
      body: JSON.stringify(updateInput),
    });
    assert.equal(unauthorizedResponse.status, 404);
    assert.equal(database.templates[0].name, "Upper body");
    assert.ok(database.items.some((item) => item.id === "item-a1"));

    const response = await fetch(`${baseUrl}/api/templates/template-a`, {
      method: "PUT",
      headers,
      body: JSON.stringify(updateInput),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      template: {
        id: string;
        name: string;
        created_at: string;
        items: Array<{ position: number; exercise_name: string; planned_weight_kg: number }>;
      };
    };
    assert.equal(payload.template.id, "template-a");
    assert.equal(payload.template.name, "Updated upper body");
    assert.equal(payload.template.created_at, "2026-10-24T00:00:00.000Z");
    assert.deepEqual(
      payload.template.items.map(({ position, exercise_name, planned_weight_kg }) => [
        position,
        exercise_name,
        planned_weight_kg,
      ]),
      [[1, "Row", 55], [2, "Bench press", 105]],
    );
    assert.equal(database.templates.length, 2);
    assert.equal(database.items.filter((item) => item.template_id === "template-a").length, 2);
    assert.ok(database.items.some((item) => item.id === "item-b1"));

    const runResponse = await fetch(`${baseUrl}/api/templates/template-a`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        name: "Updated running",
        activity_type: "run",
        items: [{
          planned_distance_km: 10.5,
          planned_pace_seconds_per_km: 320,
        }],
      }),
    });
    assert.equal(runResponse.status, 200);
    const runPayload = await runResponse.json() as {
      template: {
        name: string;
        activity_type: string;
        items: Array<{
          id: string;
          position: number;
          exercise_name: string | null;
          planned_sets: number | null;
          planned_reps: number | null;
          planned_weight_kg: number | null;
          planned_distance_km: number;
          planned_pace_seconds_per_km: number;
        }>;
      };
    };
    assert.equal(runPayload.template.name, "Updated running");
    assert.equal(runPayload.template.activity_type, "run");
    assert.deepEqual(runPayload.template.items, [{
      id: runPayload.template.items[0].id,
      position: 1,
      exercise_name: null,
      planned_sets: null,
      planned_reps: null,
      planned_weight_kg: null,
      planned_distance_km: 10.5,
      planned_pace_seconds_per_km: 320,
    }]);
    assert.equal(database.items.filter((item) => item.template_id === "template-a").length, 1);
    assert.ok(database.items.some((item) => item.id === "item-b1"));
    assert.equal(database.commits, 2);
  });
});

test("users cannot delete another user's template", async () => {
  const template: TemplateRow = {
    id: "template-a",
    user_id: "user-a",
    name: "Run",
    activity_type: "run",
    created_at: "2026-10-24T00:00:00.000Z",
  };
  const database = new MemoryTemplatesDatabase([template]);
  await withTestApp(database, async (baseUrl) => {
    const otherUserResponse = await fetch(`${baseUrl}/api/templates/template-a`, {
      method: "DELETE",
      headers: { "x-test-user-id": "user-b" },
    });
    assert.equal(otherUserResponse.status, 404);
    assert.equal(database.templates.length, 1);

    const ownerResponse = await fetch(`${baseUrl}/api/templates/template-a`, {
      method: "DELETE",
      headers: { "x-test-user-id": "user-a" },
    });
    assert.equal(ownerResponse.status, 204);
    assert.equal(database.templates.length, 0);
  });
});
