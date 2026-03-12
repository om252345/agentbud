<div align="center">
  <h1>🛡️ AgentBud</h1>
  <p><strong>A drop-in observability proxy and tamper-proof audit trail for AI agents.</strong></p>

  [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AgentBud/agentbud)
  [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template?template=https://github.com/AgentBud/agentbud)
</div>

---

AgentBud sits completely transparently between your application and your LLM provider. You just point your OpenAI SDK (or Anthropic, Gemini, etc.) at `localhost:3000` instead of the public API. 

It logs every LLM request and response, hashes the payloads into an unforgeable cryptographic chain, strips out sensitive user data (PII) before it leaves your server, and gives you a beautiful real-time dashboard to watch your agents think and act.

## Features

- **Zero-Friction Setup**: Swap out the base URL in your SDK. That's it.
- **Cryptographic Trust**: Every LLM trace gets hashed and chained. Turn on asymmetric signing, and AgentBud signs every log with a local Ed25519 private key. Even if a bad actor gets full read/write access to your database, they cannot alter the audit logs without destroying the signature.
- **Data Redaction**: Tell AgentBud to strip `email` or `credit_card` fields from JSON payloads before hitting OpenAI.
- **Loop Protection**: Agents get stuck sometimes. Set a `maxRepeats` circuit breaker to kill runaway loops before they drain your wallet.
- **Multi-Provider Routing**: Route specific tools or steps to cheaper (or local) models dynamically.

---

## Getting Started

### 1. Run with Docker (Recommended)

The easiest way to get AgentBud running locally is with Docker Compose.

```bash
git clone https://github.com/AgentBud/agentbud.git
cd agentbud
docker compose up -d
```

That's it! 
- The proxy is now listening at `http://localhost:3000`
- The real-time dashboard is available at [http://localhost:3000](http://localhost:3000) in your browser.

*(If you don't want to build it yourself, you can also pull our pre-built image using our `docker-compose.hub.yml` file!)*

### 2. Send a Request

Just hit AgentBud like you would hit OpenAI natively. Pass in a few custom headers so AgentBud knows how to categorize the trace in your dashboard:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "X-AgentBud-Run-ID: ticket-123" \
  -H "X-AgentBud-Workflow: support-ticket-swarm" \
  -H "X-AgentBud-Step: analyze-intent" \
  -H "X-AgentBud-Provider: openai" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Classify this support ticket."}]
  }'
```

AgentBud records the trace, strips those `X-AgentBud-*` headers out, and pipes the payload securely to OpenAI. Check your dashboard—it's already there.

---

## The Configuration Guide (`agent-config.yaml`)

AgentBud's true power comes from its configuration file. You define **Workflows** and **Steps** here, and the server hot-reloads instantly whenever you save the file. 

Here is a practical example of how you might configure a support agent:

```yaml
global:
  hashAlgo: sha256       # How we fingerprint data
  chainHashes: true      # Turn on the append-only cryptographic chain
  autoDetectLoops: true  # Enable circuit breaking
  provider: openai       # Default fallback provider
  crypto:                # The Notary Engine
    mode: "asymmetric"   # Generates private/public keys and signs all hashes
    hashAlgo: "sha256"
    signAlgo: "ed25519"
    keyDir: "./keys"     # Where we save the keys (gitignored)

workflows:
  customer-support:
    description: "Main workflow for handling incoming tickets"
    steps:
      extract-user-info:
        stepType: reasoning
        hashInput: true
        hashOutput: true
        redactPII: [email, phone, ssn, credit_card] # Strips these from the payload!
        maxRepeats: 5 # If this step loops 5 times in a row, block it.
        
      search-kb:
        stepType: tool-call
        provider: ollama # Use a cheap local model just for searching
        baseUrl: http://192.168.1.100:11434 # Point specifically to our local rig
```

### Understanding the Parameters

#### Global Settings
- `chainHashes`: When true, the hash of the current trace includes the hash of the *previous* trace. If someone deletes a row in your database, the chain breaks.
- `autoDetectLoops`: Turns on state tracking to ensure agents don't get stuck in infinite thought loops.
- `crypto.mode`: Can be `none`, `simple`, or `asymmetric`. Use `asymmetric` for true tamper-proofing; it generates an Ed25519 keypair and creates unforgeable signatures for your request logs.

#### Step Settings
Every step you execute (by passing the `X-AgentBud-Step` header) can have specific rules applied to it:

- `stepType`: A visual label for your dashboard (`reasoning`, `tool-call`, `action`, etc).
- `hashInput` / `hashOutput`: Tells AgentBud to cryptographically snapshot the request or response payloads to prove exactly what the LLM saw and said.
- `redactPII`: A list of JSON keys. If you send a JSON payload with an `"email": "test@test.com"` field, AgentBud replaces the value with `"[REDACTED]"` before it ever hits the internet.
- `maxRepeats`: Drops the request with an HTTP 429 if the agent repeats this exact step too many times in a row for the same `Run-ID`.
- `provider` / `baseUrl`: Force this specific step to route to a different LLM provider, completely bypassing the defaults.

---

## Supported Providers

You can route requests simply by passing the name of the provider in the `X-AgentBud-Provider` header, or by setting it in your YAML config.

| Provider Name | Where it routes to |
|---|---|
| `openai` | https://api.openai.com |
| `anthropic` | https://api.anthropic.com |
| `gemini` | https://generativelanguage.googleapis.com |
| `grok` | https://api.x.ai |
| `cohere` | https://api.cohere.ai |
| `ollama` | http://host.docker.internal:11434 |

*Don't see your provider? Just use the `baseUrl` parameter in your config or the `X-AgentBud-Base-Url` header to route traffic wherever you want.*

---

## License

Apache 2.0
