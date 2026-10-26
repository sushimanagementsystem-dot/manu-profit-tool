import { z } from 'zod';

import { operationsSchema } from '../revisions/operations.schema';

/**
 * The assistant's entire capability surface. It can read this job's analysis and propose
 * changes; it cannot write to the database, run queries, or reach another job. `jobId` is
 * never a tool parameter — the backend injects it from the authenticated request.
 */
export const chatToolSchemas = {
  get_summary: z.object({}),
  list_items: z.object({
    sortBy: z.enum(['gpContribution', 'gpPercent', 'unitsSold', 'netRevenue', 'name']).default('gpContribution'),
    order: z.enum(['asc', 'desc']).default('desc'),
    onlyMissingCost: z.boolean().default(false),
    category: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  get_item: z.object({ menuItemId: z.string().uuid() }),
  search_items: z.object({ query: z.string().min(1).max(100) }),
  search_ingredients: z.object({ query: z.string().min(1).max(100) }),
  get_data_quality: z.object({}),
  list_unmatched_pos_items: z.object({}),
  preview_changes: z.object({ operations: operationsSchema }),
  propose_changes: z.object({
    operations: operationsSchema,
    summary: z.string().min(1).max(500),
  }),
} as const;

export type ChatToolName = keyof typeof chatToolSchemas;

type ToolDefinition = {
  name: ChatToolName;
  description: string;
  input_schema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
};

const TOOL_DESCRIPTIONS: Record<ChatToolName, string> = {
  get_summary:
    'Overall figures for the analysis: net revenue, units sold, gross profit, GP %, and how much of the revenue has complete costing.',
  list_items:
    'Menu items with their price, cost per portion, gross profit, units sold and menu-engineering class. Use onlyMissingCost to find items whose cost is unknown.',
  get_item:
    'One menu item in full: its recipe lines with ingredient quantities and prices, and where each number came from.',
  search_items: 'Find menu items by name. Use this to resolve a name the user mentions into a menuItemId.',
  search_ingredients:
    'Find ingredients by name, with their current unit cost. Use this to resolve a name into an ingredientId.',
  get_data_quality: 'Everything that is missing, uncertain or inconsistent in this analysis.',
  list_unmatched_pos_items:
    'POS item names that are not linked to a menu item yet, with the suggested match and its score. Each one has a matchId for MAP_POS_ITEM.',
  preview_changes:
    'Calculate the effect of changes without saving them. Use this to answer "what if" questions (e.g. a price increase). Never state financial effects you have not obtained from this tool.',
  propose_changes:
    'Propose changes for the user to confirm. Use this whenever the user tells you a value is wrong or asks you to change something. The user must confirm before anything is saved; never claim a change has been applied.',
};

/** Tool definitions in Claude's wire format, built from the same zod schemas used to validate calls. */
export function buildToolDefinitions(): ToolDefinition[] {
  return (Object.keys(chatToolSchemas) as ChatToolName[]).map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    input_schema: z.toJSONSchema(chatToolSchemas[name], { io: 'input' }) as ToolDefinition['input_schema'],
  }));
}
