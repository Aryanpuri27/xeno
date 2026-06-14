import { runSegmentAgent } from "./segment-agent";
import { runProductAgent } from "./product-agent";
import { runContentAgent } from "./content-agent";
import { runChannelAgent } from "./channel-agent";
import { getCampaignMemory } from "@/lib/memory/campaign";
import { OrchestratorError } from "@/lib/utils/errors";
import type { Channel } from "@xeno/shared-types";

type ToolName =
  | "run_segment_agent"
  | "run_product_agent"
  | "run_content_agent"
  | "run_channel_agent"
  | "get_campaign_memory";

/**
 * Tool executor — routes OpenAI tool call names to the actual agent functions.
 * Called from the orchestrator's tool-use loop for every tool call the model makes.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name as ToolName) {
    case "get_campaign_memory":
      return getCampaignMemory(args["goal"] as string);

    case "run_segment_agent":
      return runSegmentAgent(args["description"] as string);

    case "run_product_agent":
      return runProductAgent(args["category"] as string, args["context"] as string);

    case "run_channel_agent":
      return runChannelAgent(args["audienceDescription"] as string);

    case "run_content_agent":
      return runContentAgent({
        channel: args["channel"] as Channel,
        audienceDescription: args["audienceDescription"] as string,
        products: args["products"] as string[],
        tone: args["tone"] as string | undefined,
      });

    default:
      throw new OrchestratorError(`Unknown tool: ${name}. The model called a tool that doesn't exist.`);
  }
}
