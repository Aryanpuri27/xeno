import type OpenAI from "openai";

/**
 * Tool definitions for the OpenAI function-calling (tool-use) orchestrator loop.
 * Each tool maps to a specialized agent function.
 * The model decides which tools to call, in what order, based on what it needs.
 */
export const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_campaign_memory",
      description:
        "ALWAYS call this FIRST before any other tool. Retrieves the 3 most similar past campaigns by semantic similarity. " +
        "Returns their CTR, open rate, best channel, and AI summary. Use this to inform all subsequent decisions.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The current campaign goal in plain English" },
        },
        required: ["goal"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_segment_agent",
      description:
        "Generate and validate a SQL query for the target audience. " +
        "Returns a REAL customer count from the database and 5 sample records. " +
        "If count is 0, broaden the audience description. Call AFTER get_campaign_memory.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Natural language audience description (e.g. 'running shoe buyers inactive for 60 days')",
          },
        },
        required: ["description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_product_agent",
      description:
        "Find relevant Nike products for the campaign using semantic search. " +
        "Returns primary products, cross-sell, and upsell suggestions from the real catalog. " +
        "Call AFTER run_segment_agent.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Primary product category",
            enum: ["running", "basketball", "lifestyle", "training", "apparel", "accessories"],
          },
          context: { type: "string", description: "Campaign context and audience description" },
        },
        required: ["category", "context"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_channel_agent",
      description:
        "Recommend the best channel (whatsapp/email/sms/rcs) based on REAL historical performance data. " +
        "Returns a channel recommendation with confidence score and data-driven reasoning. " +
        "Call AFTER run_segment_agent.",
      parameters: {
        type: "object",
        properties: {
          audienceDescription: {
            type: "string",
            description: "Description of the target audience",
          },
        },
        required: ["audienceDescription"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_content_agent",
      description:
        "Generate personalized Nike campaign message copy for the chosen channel. " +
        "Respects brand tone, channel constraints, and character limits. " +
        "Must be called AFTER run_channel_agent and run_product_agent.",
      parameters: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            enum: ["whatsapp", "email", "sms", "rcs"],
            description: "Communication channel",
          },
          audienceDescription: { type: "string", description: "Target audience description" },
          products: {
            type: "array",
            items: { type: "string" },
            description: "Product names to feature in the message",
          },
          tone: {
            type: "string",
            description: "Override brand tone if needed (optional)",
          },
        },
        required: ["channel", "audienceDescription", "products"],
        additionalProperties: false,
      },
    },
  },
];
