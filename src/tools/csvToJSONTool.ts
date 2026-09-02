import { tool } from "@langchain/core/tools";
import csvtojson from "csvtojson";
import { z } from "zod";

export function getCSVToJSONTool() {
    return tool(
        async ({ cvsText }) => {
            const result = await csvtojson().fromString(cvsText);
            console.log('[getCSVToJSONTool] conversion result finished:', result.length, 'records');

            return JSON.stringify(result);
        },
        {
            name: "csv_to_json",
            description: "Converts CSV text to JSON format.",
            schema: z.object({
                cvsText: z.string().describe("The CSV text to convert to JSON.")
            })
        }
    )
}