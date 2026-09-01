import { AIMessage } from 'langchain';
import { getSystemPrompt, type IntentData, IntentSchema } from '../../prompts/v1/identifyIntent.ts';
import { OpenRouterService } from '../../services/openRouterService.ts';
import type { GraphState } from '../state.ts';

export function intentNode(openRouterService: OpenRouterService) {
    return async (state: GraphState): Promise<Partial<GraphState>> => {
        console.log('🧠 Intent node processing...');
        try {
            const rawQuestion = state.messages.at(-1)!.text as string;

            const result = await openRouterService.generateStructured(
                getSystemPrompt(),
                rawQuestion,
                IntentSchema,
            )

            const parsed = result.data as IntentData

            if (!parsed.intent || !parsed.fileType) {
                console.log('🧠 Intent node: No intent or fileType found in the response. Returning default values. ', parsed);
                throw new Error('No intent or fileType found in the response.');
            }

            parsed.fileName ??= `data.${parsed.fileType}`;
            console.log('Extracted intent', parsed.intent);
            console.log('File name: ', parsed.fileName);
            console.log('File type: ', parsed.fileType);

            return {
                intent: parsed.intent,
                fileContent: parsed.fileContent ?? '',
                fileName: parsed.fileName,
            };

        } catch (error) {
            console.error('Intent node error:', error);
            return {
                messages: [new AIMessage('Sorry, I had trouble understanding the intent. Please rephrase your question or provide more details.')],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };
}
