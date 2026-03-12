import { describe, expect, it } from 'bun:test';
import { app } from '../src/index';

describe('AgentBud Proxy', () => {
    it('should parse configuration and handle loop detection', async () => {
        // Generate a unique run ID for this test session
        const runId = crypto.randomUUID();

        // The "enrich-lead" step in agent-config.yaml has maxRepeats: 3
        // Send 3 requests
        for (let i = 0; i < 3; i++) {
            const res = await app.request('/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'X-AgentBud-Run-ID': runId,
                    'X-AgentBud-Workflow': 'lead-scoring-v2',
                    'X-AgentBud-Step': 'enrich-lead',
                    'X-AgentBud-Step-Type': 'tool-call',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: "hello" }]
                })
            });
            // OpenAI returns 401 Unauthorized without an API key, which confirms proxying!
            expect(res.status).toBe(401);

            // And check the custom hashing header
            const chainHash = res.headers.get('X-AgentBud-Chain-Hash');
            expect(chainHash).toBeTruthy();
        }

        // 4th request should fail with 429 Too Many Requests
        const res4 = await app.request('/v1/chat/completions', {
            method: 'POST',
            headers: {
                'X-AgentBud-Run-ID': runId,
                'X-AgentBud-Workflow': 'lead-scoring-v2',
                'X-AgentBud-Step': 'enrich-lead',
                'X-AgentBud-Step-Type': 'tool-call',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: "hello" }]
            })
        });

        expect(res4.status).toBe(429);
        const body: any = await res4.json();
        expect(body.error).toBe('Too Many Requests: Loop Detected');
    }, 15000); // Extends timeout duration to 15s since this calls external APIs (OpenAI)

});
