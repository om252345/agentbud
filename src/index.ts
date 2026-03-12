import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { streamSSE } from 'hono/streaming';
import { getWorkflowStep, getConfig } from './config';
import { insertTrace, getConsecutiveRepeats, getPreviousChainHash, getRuns, getRunTraces, getTrace, type TraceRecord } from './db';
import { cryptoService } from './crypto_service';
const app = new Hono();

// Dashboard API Router
const api = new Hono();

// Global registry for active Server-Sent Events clients
const sseClients = new Set<any>();

api.get('/events', async (c) => {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
        sseClients.add(stream);
        console.log(`[SSE] Client connected. Active clients: ${sseClients.size}`);

        stream.onAbort(() => {
            sseClients.delete(stream);
            console.log(`[SSE] Client disconnected. Active clients: ${sseClients.size}`);
        });

        // Send an initial connected ping
        await stream.writeSSE({ event: 'connected', data: 'ok' });

        // Keep connection open indefinitely with a heartbeat
        while (true) {
            await stream.sleep(15000);
            try {
                await stream.writeSSE({ event: 'ping', data: 'heartbeat' });
            } catch {
                break;
            }
        }
    });
});

api.get('/runs', async (c) => {
    try {
        const runs = getRuns();
        return c.json(runs);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

api.get('/runs/:run_id', async (c) => {
    try {
        const runId = c.req.param('run_id');
        const traces = getRunTraces(runId);
        return c.json(traces);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

api.get('/traces/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const trace = getTrace(id);
        if (!trace) return c.json({ error: 'Not found' }, 404);
        return c.json(trace);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

api.post('/traces/:id/replay', async (c) => {
    try {
        const id = c.req.param('id');
        const trace = getTrace(id);
        if (!trace) return c.json({ error: 'Trace not found' }, 404);

        const port = process.env.PORT || 3000;
        const replayPath = trace.request_path || '/v1/chat/completions';
        const proxyUrl = `http://localhost:${port}${replayPath}`;

        console.log(`[Replay] Triggering replay for trace ${id} to ${replayPath}`);

        const headers = new Headers();
        headers.set('Content-Type', 'application/json');

        const body = await c.req.json().catch(() => ({}));
        const apiKey = body.apiKey || '';
        if (apiKey) {
            headers.set('Authorization', `Bearer ${apiKey}`);
        }

        // Mimic original headers but tag it as a replay run
        const replayRunId = trace.run_id.endsWith('-replay') ? trace.run_id : `${trace.run_id}-replay`;
        headers.set('X-AgentBud-Run-ID', replayRunId);
        headers.set('X-AgentBud-Workflow', trace.workflow);
        headers.set('X-AgentBud-Step', trace.step);
        headers.set('X-AgentBud-Parent-Step', trace.parent_step);
        headers.set('X-AgentBud-Step-Type', trace.step_type);

        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers,
            body: trace.req_payload
        });

        const resData = await response.text();

        // Try parsing JSON if successful otherwise return plain text
        let parsed = resData;
        try { parsed = JSON.parse(resData); } catch { }

        return c.json({
            success: response.ok,
            status: response.status,
            message: 'Replay executed successfully. A new trace has been created.',
            run_id: replayRunId,
            response: parsed
        }, response.status === 200 ? 200 : 500);

    } catch (e: any) {
        console.error('[Replay Error]', e);
        return c.json({ error: 'Internal Replay Error', message: e.message }, 500);
    }
});


app.route('/api', api);

app.post('/v1/*', async (c) => {
    // 1. Parse Headers
    const traceparent = c.req.header('traceparent') || `00-${crypto.randomUUID().replace(/-/g, '')}-0000000000000000-01`;
    const runId = c.req.header('X-AgentBud-Run-ID') || 'unknown';
    const workflowName = c.req.header('X-AgentBud-Workflow') || 'unknown';
    const stepName = c.req.header('X-AgentBud-Step') || 'unknown';
    const parentStep = c.req.header('X-AgentBud-Parent-Step') || 'unknown';
    const stepTypeReq = c.req.header('X-AgentBud-Step-Type') || 'unknown';

    const targetUrl = new URL(c.req.url); // Use request URL to determine proxy path

    try {
        // Read raw body to hash and forward
        let reqPayload = await c.req.text();

        // 2. Load Config for exact workflow and step
        const config = getConfig();
        const stepDef = getWorkflowStep(workflowName, stepName);

        // Support varying LLM providers
        let baseUrl = 'https://api.openai.com'; // Default fallback

        // Priority: 1. Header (highest), 2. Step Config, 3. Global Config
        const providerReq = (
            c.req.header('X-AgentBud-Provider') ||
            stepDef?.provider ||
            config.global.provider
        )?.toLowerCase();

        const customBaseUrl = (
            c.req.header('X-AgentBud-Base-Url') ||
            stepDef?.baseUrl ||
            config.global.baseUrl
        );

        if (customBaseUrl) {
            baseUrl = customBaseUrl.replace(/\/$/, ''); // Remove trailing slash
        } else if (providerReq) {
            switch (providerReq) {
                case 'anthropic': baseUrl = 'https://api.anthropic.com'; break;
                case 'gemini': baseUrl = 'https://generativelanguage.googleapis.com'; break;
                case 'grok': baseUrl = 'https://api.x.ai'; break;
                case 'cohere': baseUrl = 'https://api.cohere.ai'; break;
                case 'openai': baseUrl = 'https://api.openai.com'; break;
                case 'ollama': baseUrl = 'http://host.docker.internal:11434'; break;
            }
        }

        const proxyUrl = `${baseUrl}${targetUrl.pathname}${targetUrl.search}`;

        // Defaults if step definition is missing
        const hashInput = stepDef?.hashInput ?? false;
        const hashOutput = stepDef?.hashOutput ?? false;
        const redactPiiFields = stepDef?.redactPII || [];
        const stepType = stepDef?.stepType || stepTypeReq;

        // 3. Pre-Process Action (Placeholder Redaction)
        if (redactPiiFields.length > 0) {
            redactPiiFields.forEach(field => {
                // Redact exact key-value pairs using simple regex for JSON strings
                const regex = new RegExp(`("${field}"\\s*:\\s*)"([^"]+)"`, 'g');
                reqPayload = reqPayload.replace(regex, `$1"[REDACTED]"`);
            });
        }

        let reqHash = '';
        if (hashInput) {
            reqHash = cryptoService.hash(reqPayload);
        }

        // 4. Circuit Breaker / Loop Detection
        if (runId !== 'unknown' && stepName !== 'unknown' && stepDef && stepDef.maxRepeats !== undefined) {
            const repeats = getConsecutiveRepeats(runId, stepName);
            if (repeats >= stepDef.maxRepeats) {
                console.warn(`[Circuit Breaker] Loop detected for run_id: ${runId}, step: ${stepName}. Blocked.`);
                return c.json({ error: 'Too Many Requests: Loop Detected' }, 429);
            }
        }

        // 5. Proxy Logic
        const forwardHeaders = new Headers(c.req.header());
        // Strip AgentBud headers
        forwardHeaders.delete('x-agentbud-run-id');
        forwardHeaders.delete('x-agentbud-workflow');
        forwardHeaders.delete('x-agentbud-step');
        forwardHeaders.delete('x-agentbud-parent-step');
        forwardHeaders.delete('x-agentbud-step-type');
        forwardHeaders.delete('x-agentbud-provider');
        forwardHeaders.delete('x-agentbud-base-url');
        // Important: replace host for target
        const targetHost = new URL(proxyUrl).host;
        forwardHeaders.set('host', targetHost);

        console.log(`[Proxy] Forwarding request to target: ${proxyUrl}`);
        const targetResponse = await fetch(proxyUrl, {
            method: c.req.method,
            headers: forwardHeaders,
            body: reqPayload
        });

        const status = targetResponse.status;
        const resPayload = await targetResponse.text();

        // 6. Post-Process
        let resHash = '';
        if (hashOutput) {
            resHash = cryptoService.hash(resPayload);
        }

        // 7. Cryptographic Chain & Signature Tracking
        let chainHash = '';
        let signature = '';

        if (config.global.chainHashes) {
            const prevChainHash = getPreviousChainHash();
            // Concatenate input hash, output hash, and previous chain hash
            chainHash = cryptoService.hash(reqHash + resHash + prevChainHash);

            // If asymmetric mode is enabled, sign the chain_hash
            signature = cryptoService.sign(chainHash);
        }

        // 8. Store in SQLite DB
        // Use a brand new UUID for the DB primary key to ensure append-only logging, 
        // even if the client sends the exact same traceparent header.
        const dbTraceId = crypto.randomUUID();

        const traceRecord: TraceRecord = {
            id: dbTraceId,
            traceparent,
            run_id: runId,
            workflow: workflowName,
            step: stepName,
            parent_step: parentStep,
            step_type: stepType,
            req_payload: reqPayload,
            res_payload: resPayload,
            req_hash: reqHash,
            res_hash: resHash,
            chain_hash: chainHash,
            signature: signature || undefined,
            status,
            request_path: targetUrl.pathname + targetUrl.search
        };
        insertTrace(traceRecord);

        // Notify all connected SSE clients about the new DB entry instantly
        sseClients.forEach(async (client) => {
            try {
                await client.writeSSE({
                    event: 'message',
                    data: JSON.stringify({ type: 'new-trace', run_id: runId })
                });
            } catch (e) {
                // Ignore dead sockets, onAbort will clean them up
            }
        });

        // 9. Respond to Client
        const resHeaders = new Headers(targetResponse.headers);
        // Inject custom hash header
        if (chainHash) {
            resHeaders.set('X-AgentBud-Chain-Hash', chainHash);
        }

        return new Response(resPayload, {
            status,
            headers: resHeaders
        });

    } catch (err: any) {
        console.error('[Proxy] Error:', err);
        return c.json({ error: 'Internal Proxy Error', message: err.message }, 500);
    }
});

app.use('/*', serveStatic({ root: './frontend/dist' }));

export { app };
export default {
    port: process.env.PORT || 3000,
    fetch: app.fetch
};
