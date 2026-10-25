import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

type TemplatesClient = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

export type TemplatesDatabase = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  connect: () => Promise<TemplatesClient>;
};

type UserIdResolver = (request: Request) => string | null;

type StrengthTemplateItemInput = {
  exercise_name: string;
  planned_sets: number;
  planned_reps: number;
  planned_weight_kg: number;
};

type RunTemplateItemInput = {
  planned_distance_km: number;
  planned_pace_seconds_per_km: number;
};

type TemplateInput =
  | {
      name: string;
      activity_type: "strength";
      items: StrengthTemplateItemInput[];
    }
  | {
      name: string;
      activity_type: "run";
      items: [RunTemplateItemInput];
    };

type ValidationResult =
  | { ok: true; value: TemplateInput }
  | { ok: false; error: string };

const templateColumns = "id, name, activity_type, created_at";
const templateItemColumns = `ti.id, ti.template_id, ti.position, ti.exercise_name, ti.planned_sets,
  ti.planned_reps, ti.planned_weight_kg, ti.planned_distance_km, ti.planned_pace_seconds_per_km`;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateTemplate(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Enter the template details before saving." };
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) {
    return { ok: false, error: "Enter a template name up to 100 characters." };
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 40) {
    return { ok: false, error: "Add between 1 and 40 items to this template." };
  }

  if (input.activity_type === "strength") {
    const items: StrengthTemplateItemInput[] = [];
    for (const rawItem of input.items) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        return { ok: false, error: "Complete each exercise before saving." };
      }
      const item = rawItem as Record<string, unknown>;
      const exerciseName =
        typeof item.exercise_name === "string" ? item.exercise_name.trim() : "";
      if (!exerciseName || exerciseName.length > 120) {
        return { ok: false, error: "Enter an exercise name up to 120 characters." };
      }
      if (
        !Number.isInteger(item.planned_sets) ||
        Number(item.planned_sets) < 1 ||
        Number(item.planned_sets) > 100
      ) {
        return { ok: false, error: "Enter a whole number of sets from 1 to 100." };
      }
      if (
        !Number.isInteger(item.planned_reps) ||
        Number(item.planned_reps) < 1 ||
        Number(item.planned_reps) > 10000
      ) {
        return { ok: false, error: "Enter a whole number of reps from 1 to 10,000." };
      }
      if (
        !isFiniteNumber(item.planned_weight_kg) ||
        item.planned_weight_kg < 0 ||
        item.planned_weight_kg > 99999.999
      ) {
        return { ok: false, error: "Enter a planned weight of zero or more." };
      }
      items.push({
        exercise_name: exerciseName,
        planned_sets: Number(item.planned_sets),
        planned_reps: Number(item.planned_reps),
        planned_weight_kg: Number(item.planned_weight_kg.toFixed(3)),
      });
    }
    return { ok: true, value: { name, activity_type: "strength", items } };
  }

  if (input.activity_type === "run") {
    if (input.items.length !== 1) {
      return { ok: false, error: "A running template needs one distance and pace." };
    }
    const rawItem = input.items[0];
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      return { ok: false, error: "Enter a distance and pace for this running template." };
    }
    const item = rawItem as Record<string, unknown>;
    if (
      !isFiniteNumber(item.planned_distance_km) ||
      item.planned_distance_km <= 0 ||
      item.planned_distance_km > 99999.999
    ) {
      return { ok: false, error: "Enter a planned distance greater than zero." };
    }
    if (
      !Number.isInteger(item.planned_pace_seconds_per_km) ||
      Number(item.planned_pace_seconds_per_km) < 1 ||
      Number(item.planned_pace_seconds_per_km) > 360000
    ) {
      return { ok: false, error: "Enter a planned pace greater than zero." };
    }
    return {
      ok: true,
      value: {
        name,
        activity_type: "run",
        items: [{
          planned_distance_km: Number(item.planned_distance_km.toFixed(3)),
          planned_pace_seconds_per_km: Number(item.planned_pace_seconds_per_km),
        }],
      },
    };
  }

  return { ok: false, error: "Choose strength or running for this template." };
}

function normalizeTemplateItem(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    position: Number(row.position),
    exercise_name: row.exercise_name == null ? null : String(row.exercise_name),
    planned_sets: row.planned_sets == null ? null : Number(row.planned_sets),
    planned_reps: row.planned_reps == null ? null : Number(row.planned_reps),
    planned_weight_kg:
      row.planned_weight_kg == null ? null : Number(row.planned_weight_kg),
    planned_distance_km:
      row.planned_distance_km == null ? null : Number(row.planned_distance_km),
    planned_pace_seconds_per_km:
      row.planned_pace_seconds_per_km == null
        ? null
        : Number(row.planned_pace_seconds_per_km),
  };
}

function respondUnauthenticated(response: Response) {
  response.status(401).json({ error: "Sign in to manage your templates." });
}

function normalizeCreatedTemplate(
  row: Record<string, unknown>,
  input: TemplateInput,
  itemIds: string[],
) {
  const items = input.activity_type === "strength"
    ? input.items.map((item, index) => ({
        id: itemIds[index],
        position: index + 1,
        exercise_name: item.exercise_name,
        planned_sets: item.planned_sets,
        planned_reps: item.planned_reps,
        planned_weight_kg: item.planned_weight_kg,
        planned_distance_km: null,
        planned_pace_seconds_per_km: null,
      }))
    : [{
        id: itemIds[0],
        position: 1,
        exercise_name: null,
        planned_sets: null,
        planned_reps: null,
        planned_weight_kg: null,
        planned_distance_km: input.items[0].planned_distance_km,
        planned_pace_seconds_per_km: input.items[0].planned_pace_seconds_per_km,
      }];

  return {
    id: String(row.id),
    name: String(row.name),
    activity_type: row.activity_type,
    created_at: row.created_at,
    items,
  };
}

async function insertTemplateItems(
  client: TemplatesClient,
  templateId: string,
  input: TemplateInput,
): Promise<string[]> {
  const itemIds: string[] = [];
  if (input.activity_type === "strength") {
    for (const [index, item] of input.items.entries()) {
      const itemId = randomUUID();
      itemIds.push(itemId);
      await client.query(
        `INSERT INTO public.template_items
          (id, template_id, position, exercise_name, planned_sets, planned_reps,
           planned_weight_kg, planned_distance_km, planned_pace_seconds_per_km)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)`,
        [
          itemId,
          templateId,
          index + 1,
          item.exercise_name,
          item.planned_sets,
          item.planned_reps,
          item.planned_weight_kg,
        ],
      );
    }
  } else {
    const item = input.items[0];
    const itemId = randomUUID();
    itemIds.push(itemId);
    await client.query(
      `INSERT INTO public.template_items
        (id, template_id, position, planned_distance_km, planned_pace_seconds_per_km)
       VALUES ($1, $2, 1, $3, $4)`,
      [itemId, templateId, item.planned_distance_km, item.planned_pace_seconds_per_km],
    );
  }
  return itemIds;
}

export function createTemplatesRouter(
  database: TemplatesDatabase,
  resolveUserId: UserIdResolver,
) {
  const router = Router();

  router.get("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const templatesResult = await database.query(
        `SELECT ${templateColumns}
         FROM public.templates
         WHERE user_id = $1
         ORDER BY created_at DESC, id`,
        [userId],
      );
      if (!templatesResult.rows.length) {
        response.json({ templates: [] });
        return;
      }

      const itemsResult = await database.query(
        `SELECT ${templateItemColumns}
         FROM public.template_items ti
         JOIN public.templates t ON t.id = ti.template_id
         WHERE t.user_id = $1
         ORDER BY ti.template_id, ti.position`,
        [userId],
      );
      const itemsByTemplate = new Map<string, ReturnType<typeof normalizeTemplateItem>[]>();
      for (const row of itemsResult.rows) {
        const templateId = String(row.template_id);
        const items = itemsByTemplate.get(templateId) ?? [];
        items.push(normalizeTemplateItem(row));
        itemsByTemplate.set(templateId, items);
      }

      response.json({
        templates: templatesResult.rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          activity_type: row.activity_type,
          created_at: row.created_at,
          items: itemsByTemplate.get(String(row.id)) ?? [],
        })),
      });
    } catch (error) {
      console.error("Could not load templates.", error);
      response.status(500).json({
        error: "We couldn't load your templates. Please try again.",
      });
    }
  });

  router.post("/", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const validation = validateTemplate(request.body);
    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    let client: TemplatesClient | undefined;
    let transactionStarted = false;
    try {
      client = await database.connect();
      await client.query("BEGIN");
      transactionStarted = true;
      const templateId = randomUUID();
      const templateResult = await client.query(
        `INSERT INTO public.templates (id, user_id, name, activity_type)
         VALUES ($1, $2, $3, $4)
         RETURNING ${templateColumns}`,
        [templateId, userId, validation.value.name, validation.value.activity_type],
      );
      const template = templateResult.rows[0];
      if (!template) {
        throw new Error("The database did not return the created template.");
      }

      const itemIds = await insertTemplateItems(client, templateId, validation.value);

      await client.query("COMMIT");
      transactionStarted = false;
      response.status(201).json({
        template: normalizeCreatedTemplate(template, validation.value, itemIds),
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Could not roll back failed template creation.", rollbackError);
        }
      }
      console.error("Could not create template.", error);
      response.status(500).json({
        error: "We couldn't save this template. Please try again.",
      });
    } finally {
      client?.release();
    }
  });

  router.put("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    const validation = validateTemplate(request.body);
    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    let client: TemplatesClient | undefined;
    let transactionStarted = false;
    try {
      client = await database.connect();
      await client.query("BEGIN");
      transactionStarted = true;
      const templateId = request.params.id;
      const templateResult = await client.query(
        `UPDATE public.templates
         SET name = $3, activity_type = $4
         WHERE id = $1 AND user_id = $2
         RETURNING ${templateColumns}`,
        [templateId, userId, validation.value.name, validation.value.activity_type],
      );
      const template = templateResult.rows[0];
      if (!template) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        response.status(404).json({ error: "Template not found." });
        return;
      }

      await client.query(
        "DELETE FROM public.template_items WHERE template_id = $1",
        [templateId],
      );
      const itemIds = await insertTemplateItems(client, templateId, validation.value);
      await client.query("COMMIT");
      transactionStarted = false;
      response.json({
        template: normalizeCreatedTemplate(template, validation.value, itemIds),
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Could not roll back failed template update.", rollbackError);
        }
      }
      console.error("Could not update template.", error);
      response.status(500).json({
        error: "We couldn't save changes to this template. Please try again.",
      });
    } finally {
      client?.release();
    }
  });

  router.delete("/:id", async (request, response) => {
    const userId = resolveUserId(request);
    if (!userId) {
      respondUnauthenticated(response);
      return;
    }

    try {
      const result = await database.query(
        `DELETE FROM public.templates
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [request.params.id, userId],
      );
      if (!result.rows[0]) {
        response.status(404).json({ error: "Template not found." });
        return;
      }
      response.status(204).end();
    } catch (error) {
      console.error("Could not delete template.", error);
      response.status(500).json({
        error: "We couldn't remove this template. Please try again.",
      });
    }
  });

  return router;
}
