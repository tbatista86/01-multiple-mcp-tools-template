import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getCSVToJSONTool } from "../tools/csvToJSONTool.ts";
import { getMongodbTool } from "../tools/mongoDbTools.ts";


export const getMCPTools = async () => {
  const mongoDbServerConfig = getMongodbTool();

  const client = new MultiServerMCPClient({
    mcpServers: {
      ...mongoDbServerConfig,
      MongoDB: {
        ...(mongoDbServerConfig.MongoDB ?? {}),
        transport: "stdio" as const,
      },
    },
    onMessage: (log, source) => {
      console.log(`[${source.server}] ${log.data}`);
    },
  });

  const mcpTools = await client.getTools();

  return [
    ...mcpTools,
    getCSVToJSONTool(),
  ];
};
