// {
//   "mcpServers": {
//     "MongoDB": {
//       "command": "npx",
//       "args": ["-y", "mongodb-mcp-server@latest", "--readOnly"],
//       "env": {
//         "MDB_MCP_CONNECTION_STRING": "mongodb://localhost:27017/myDatabase"
//       }
//     }
//   }
// }

export const getMongodbTool = () => {
    return {
        "MongoDB": {
            transport: "sdtio" as const,
            "command": "npx",
            "args": ["-y", "mongodb-mcp-server@latest"],
            "env": {
                "MDB_MCP_CONNECTION_STRING": "mongodb://localhost:27017/dataprocessing"
            }
        }

    }
}