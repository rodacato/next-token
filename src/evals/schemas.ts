import { z, type ZodType } from "zod";

export const orderSheetSchema = z.object({
  orderId: z.string().regex(/^\d{5}$/, "orderId must be the five-digit order number"),
  items: z.array(z.object({ name: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  refundRequested: z.boolean(),
  reason: z.enum(["damaged", "wrong-item", "late", "changed-mind", "other"]),
});

export type OrderSheet = z.infer<typeof orderSheetSchema>;

export const schemas: Readonly<Record<string, ZodType>> = { "order-sheet": orderSheetSchema };

// Structured outputs take plain JSON Schema; the $schema marker is metadata the API doesn't need.
export function jsonSchemaFor(schema: ZodType): Record<string, unknown> {
  const jsonSchema = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
  delete jsonSchema.$schema;
  return jsonSchema;
}
