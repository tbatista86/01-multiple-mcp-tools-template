import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod/v3';
import { OpenRouterService } from './openRouterService.ts';

test('parseStructuredResponse extracts JSON from a fenced response', () => {
    const parsed = OpenRouterService.parseStructuredResponse(
        '```json\n{"intent":"analyze sales","fileType":"csv","fileName":"sales"}\n```',
        z.object({
            intent: z.string(),
            fileType: z.enum(['csv', 'json', 'unknown']),
            fileName: z.string().nullable().optional(),
        }),
    );

    assert.deepEqual(parsed, {
        intent: 'analyze sales',
        fileType: 'csv',
        fileName: 'sales',
    });
});

test('parseStructuredResponse rejects invalid JSON payloads', () => {
    assert.throws(() => {
        OpenRouterService.parseStructuredResponse('This is not JSON', z.object({ intent: z.string() }));
    }, /JSON|object/i);
});
