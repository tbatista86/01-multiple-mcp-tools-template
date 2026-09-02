import { AIMessage } from 'langchain';
import { getSystemPrompt, getUserPrompt } from '../../prompts/v1/agentNode.ts';
import { OpenRouterService } from '../../services/openRouterService.ts';
import type { GraphState } from '../state.ts';

export function agentNode(openRouterService: OpenRouterService) {
    return async (state: GraphState): Promise<Partial<GraphState>> => {
        console.log('🤖 Agent node processing...');
        try {

            const userMessage = getUserPrompt({
                intent: state.intent!,
                fileName: state.fileName!,
                fileContent: state.fileContent!,
            });

            const result = await openRouterService.generateStructured(
                getSystemPrompt(),
                userMessage,
                undefined,
                { useTools: false },
            );

            const answer = result.data as string;

            return {
                answer,
                messages: [new AIMessage(answer)],
            };

        } catch (error) {
            console.error('Agent error:', error);
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                messages: [new AIMessage('Sorry, I had trouble processing the request.')],
            };
        }
    };
}
