import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { type ChatGeneration } from '@langchain/core/outputs';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent, providerStrategy } from 'langchain';
import { z } from 'zod/v3';
import { config, type ModelConfig } from '../config.ts';
import { getMCPTools } from './mcpService.ts';

export class OpenRouterService {
    private config: ModelConfig;
    private llmClient: ChatOpenAI;
    private tools: any[];

    constructor(configOverride?: ModelConfig) {
        this.config = configOverride ?? config;
        this.llmClient = this.#createChatModel(this.config.models[0]);
        this.tools = [];
    }

    static parseStructuredResponse<T>(rawText: string, schema: z.ZodSchema<T>): T {
        const text = String(rawText ?? '').trim();
        const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const candidate = fencedMatch ? fencedMatch[1].trim() : text;

        const jsonText = candidate.startsWith('{') || candidate.startsWith('[')
            ? candidate
            : candidate.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] ?? candidate;

        try {
            if (jsonText && /^[\[{]/.test(jsonText.trim())) {
                const parsed = JSON.parse(jsonText);
                return schema.parse(parsed);
            }

            const keyValueText = candidate
                .replace(/\s*:\s*/g, ':')
                .replace(/\n+/g, ' ')
                .trim();

            const values: Record<string, string> = {};
            const intentMatch = keyValueText.match(/(?:intent|goal)\s*[:=]\s*"?([^\n]+?)(?:\s+(?:fileContent|fileName|fileType)\s*[:=]|$)/i);
            const fileTypeMatch = keyValueText.match(/(?:fileType|type)\s*[:=]\s*"?([a-z]+)"?/i);
            const fileNameMatch = keyValueText.match(/(?:fileName|name)\s*[:=]\s*"?([^\n]+?)(?:\s+(?:intent|fileContent|fileType)\s*[:=]|$)/i);

            if (intentMatch) values.intent = intentMatch[1].trim().replace(/[",]+$/g, '');
            if (fileTypeMatch) values.fileType = fileTypeMatch[1].trim().toLowerCase();
            if (fileNameMatch) values.fileName = fileNameMatch[1].trim().replace(/[",]+$/g, '');

            if (values.intent || values.fileType || values.fileName) {
                return schema.parse({
                    intent: values.intent ?? 'Analyze the provided data',
                    fileContent: null,
                    fileName: values.fileName ?? null,
                    fileType: values.fileType ?? 'unknown',
                });
            }

            throw new Error(`Expected a JSON object from the model response, but received: ${text}`);
        } catch (error) {
            if (error instanceof z.ZodError) throw error;
            throw new Error(`Expected a JSON object from the model response, but received: ${text}`);
        }
    }

    static inferStructuredFallbackFromPrompt<T>(userPrompt: string, schema: z.ZodSchema<T>): T {
        const lowerPrompt = userPrompt.toLowerCase();
        const fileType = lowerPrompt.includes('json') ? 'json' : lowerPrompt.includes('csv') ? 'csv' : 'unknown';
        const inferredIntent = userPrompt
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const fallback: Record<string, unknown> = {
            intent: inferredIntent || 'Analyze the provided data',
            fileContent: null,
            fileName: `data.${fileType === 'unknown' ? 'txt' : fileType}`,
            fileType,
        };

        return schema.parse(fallback);
    }

    static #isStructuredOutputUnsupported(error: unknown): boolean {
        const message = [
            error instanceof Error ? error.message : '',
            (error as any)?.error?.message ?? '',
            (error as any)?.error?.metadata?.raw ?? '',
            (error as any)?.message ?? '',
        ].join(' ');

        return /structured outputs not support|INVALID_REQUEST_BODY|response_format|not support.*structured/i.test(message);
    }

    #createChatModel(modelName: string): ChatOpenAI {
        return new ChatOpenAI({
            apiKey: this.config.apiKey,
            modelName: modelName,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
            configuration: {
                baseURL: 'https://openrouter.ai/api/v1',
                defaultHeaders: {
                    'HTTP-Referer': this.config.httpReferer,
                    'X-Title': this.config.xTitle,
                },
            },
            modelKwargs: {
                models: this.config.models,
                provider: this.config.provider,
            },
        });
    }

    async #getTools() {
        if (!this.tools.length) {
            this.tools = await getMCPTools();
        }
        return this.tools;
    }

    async generateStructured<T>(
        systemPrompt: string,
        userPrompt: string,
        schema?: z.ZodSchema<T>,
        options?: { useTools?: boolean },
    ): Promise<{ data?: T | string; }> {
        const messages = [
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt),
        ];

        if (!schema) {
            const agent = createAgent({
                tools: options?.useTools === false ? [] : await this.#getTools(),
                model: this.llmClient,
            });

            const data = await agent.invoke({ messages });
            console.log('✅ LLM Response:', JSON.stringify(data, null, 2));

            return {
                data: data.messages.at(-1)?.text as string ?? "",
            };
        }

        try {
            const agent = createAgent({
                responseFormat: providerStrategy(schema),
                tools: [],
                model: this.llmClient,
            });

            const data = await agent.invoke({ messages }, {
                callbacks: [{
                    handleChatModelStart(_llm, promptMessages) {
                        const lastMsg = promptMessages.at(-1)?.at(-1);
                        console.log(`\n🧠 LLM thinking...`);
                        console.log(` (last message: "${lastMsg?.content?.toString()}")`);
                    },
                    handleLLMEnd(output) {
                        const msg = (output.generations?.at(0)?.at(0) as ChatGeneration)?.message as AIMessage;
                        const toolCalls = msg?.tool_calls;
                        if (toolCalls?.length) {
                            console.log(`🎯 Decided to call: ${toolCalls.map((t) => t.name).join(', ')}`);
                        }
                    },
                    handleToolStart(_tool, input, _runId, _parentRunId, _tags, _metadata, runName) {
                        console.log(`🔧 Tool called: ${runName} →`, input);
                    },
                    handleToolEnd(output, _runId, _parentRunId, runName) {
                        console.log(`✅ Tool done:   ${runName} →`, output);
                    },
                }]
            });

            const structuredResponse = (data as any)?.structuredResponse as T | undefined;
            if (structuredResponse) {
                console.log('✅ LLM structured response:', JSON.stringify(structuredResponse, null, 2));
                return { data: structuredResponse };
            }

            const rawText = (data as any)?.messages?.at(-1)?.text ?? JSON.stringify(data);
            console.log('✅ LLM Response:', JSON.stringify(data, null, 2));
            try {
                return { data: OpenRouterService.parseStructuredResponse(rawText, schema) };
            } catch {
                console.warn('⚠️ Model responded without valid JSON; using prompt-based fallback.');
                return { data: OpenRouterService.inferStructuredFallbackFromPrompt(userPrompt, schema) };
            }
        } catch (error) {
            if (!OpenRouterService.#isStructuredOutputUnsupported(error)) {
                throw error;
            }

            console.warn('⚠️ Provider rejected native structured output; retrying with plain JSON parsing fallback.');
            const response = await this.llmClient.invoke(messages);
            const rawText = typeof response.content === 'string'
                ? response.content
                : Array.isArray(response.content)
                    ? response.content.map((part: any) => typeof part === 'string' ? part : part?.text ?? '').join('')
                    : JSON.stringify(response.content ?? {});

            try {
                return { data: OpenRouterService.parseStructuredResponse(rawText, schema) };
            } catch {
                return { data: OpenRouterService.inferStructuredFallbackFromPrompt(userPrompt, schema) };
            }
        }
    }
}
