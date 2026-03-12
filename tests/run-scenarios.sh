#!/bin/bash
# ==============================================================================
# AgentBud Proxy - Edge Case Test Suite
# Ensure your docker container is running! `docker compose up -d`
# ==============================================================================

PROXY_URL="http://localhost:3000/v1/chat/completions"
OLLAMA_MODEL="llama3.2" 

echo "🧪 Starting AgentBud Edge Case Tests..."

# ------------------------------------------------------------------------------
# Test 1: Deduplication / Identical Traceparents (The Overwrite Fix)
# Goal: Hitting the exact same Run ID, Step, and Traceparent multiple times.
# Expected Result: 3 distinct rows appear in the UI, proving it's append-only.
# ------------------------------------------------------------------------------
echo -e "\n\n🚀 [Test 1] Executing 3 consecutive identical requests..."
for i in {1..3}
do
  echo "Attempt $i..."
  curl -s -X POST $PROXY_URL \
    -H "Content-Type: application/json" \
    -H "traceparent: 00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01" \
    -H "X-AgentBud-Run-ID: overwrite-test-8899" \
    -H "X-AgentBud-Workflow: support-ticket-swarm" \
    -H "X-AgentBud-Step: deduplication-test" \
    -H "X-AgentBud-Parent-Step: root" \
    -H "X-AgentBud-Provider: ollama" \
    -d '{
      "model": "'"$OLLAMA_MODEL"'",
      "messages": [{"role": "user", "content": "Respond with the word: Duplicate '$i'"}]
    }' > /dev/null
  sleep 1
done
echo "✅ Check Dashboard UI for Run 'overwrite-test-8899': It should have exactly 3 distinct entries."

# ------------------------------------------------------------------------------
# Test 2: Infinite Loop Detection (Circuit Breaker)
# Goal: Spam the same exact step name within the same workflow.
# Expected Result: The first 5 succeed, but the 6th gets HTTP 429 Too Many Requests.
# Note: 'analyze-intent' has maxRepeats: 5 in agent-config.yaml
# ------------------------------------------------------------------------------
echo -e "\n\n🚀 [Test 2] Testing Circuit Breaker (Max Repeats: 5)..."
for i in {1..6}
do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $PROXY_URL \
    -H "Content-Type: application/json" \
    -H "traceparent: 00-randomloop-$i-00f067aa0ba902b7-01" \
    -H "X-AgentBud-Run-ID: circuit-breaker-test" \
    -H "X-AgentBud-Workflow: support-ticket-swarm" \
    -H "X-AgentBud-Step: analyze-intent" \
    -H "X-AgentBud-Parent-Step: root" \
    -H "X-AgentBud-Provider: ollama" \
    -d '{
      "model": "'"$OLLAMA_MODEL"'",
      "messages": [{"role": "user", "content": "Just say loop '$i'"}]
    }')
  
  if [ "$RESPONSE" == "429" ]; then
    echo "Attempt $i: Blocked! 🛡️ HTTP 429 Too Many Requests (Circuit Breaker executed perfectly)"
  else
    echo "Attempt $i: Passed (HTTP $RESPONSE) 🟢"
  fi
  sleep 0.5
done

# ------------------------------------------------------------------------------
# Test 3: Multi-Provider Override via Headers
# Goal: Send a request that dynamically overrides the provider via HTTP headers.
# Expected Result: This routes cleanly despite what agent-config.yaml says.
# ------------------------------------------------------------------------------
echo -e "\n\n🚀 [Test 3] Testing dynamic multi-provider routing (Grok)..."
# We're hitting the proxy, but requesting X.AI (grok)
# (This will fail with 401 Unauthorized unless you have a GROK API Key, but it proves the Proxy forwards properly)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $PROXY_URL \
  -H "Content-Type: application/json" \
  -H "X-AgentBud-Run-ID: multi-provider-test" \
  -H "X-AgentBud-Workflow: external-test" \
  -H "X-AgentBud-Step: try-grok" \
  -H "X-AgentBud-Provider: grok" \
  -d '{
    "model": "grok-beta",
    "messages": [{"role": "user", "content": "Hello!"}]
  }')
echo "Grok Provider Routing Result: HTTP $RESPONSE (A '401' is actually a success here, meaning it reached api.x.ai!)"

# ------------------------------------------------------------------------------
# Test 4: Custom Base URL Override
# Goal: Tell the proxy directly where to go, completely independent of presets.
# Expected Result: The Proxy pipes the request natively toward specific infra.
# ------------------------------------------------------------------------------
echo -e "\n\n🚀 [Test 4] Custom Base URL Passthrough..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $PROXY_URL \
  -H "Content-Type: application/json" \
  -H "X-AgentBud-Run-ID: baseurl-test" \
  -H "X-AgentBud-Workflow: external-test" \
  -H "X-AgentBud-Step: custom-url" \
  -H "X-AgentBud-Base-Url: http://host.docker.internal:11434" \
  -d '{
    "model": "'"$OLLAMA_MODEL"'",
    "messages": [{"role": "user", "content": "Testing direct baseurl passthrough"}]
  }')
echo "Custom Base URL Routing Object Result: HTTP $RESPONSE (A '200' means the arbitrary URL was hit successfully.)"

# ------------------------------------------------------------------------------
# Test 5: PII Redaction
# Goal: Send a payload containing sensitive fields documented in agent-config.yaml.
# Expected Result: The proxy intercepts the payload, dynamically replaces the data
# with `[REDACTED]`, and stores that sanitized version in the DB and Target infra.
# ------------------------------------------------------------------------------
echo -e "\n\n🚀 [Test 5] PII Sanitization & Redaction..."
RESPONSE=$(curl -s -X POST $PROXY_URL \
  -H "Content-Type: application/json" \
  -H "X-AgentBud-Run-ID: pii-redaction-test" \
  -H "X-AgentBud-Workflow: support-ticket-swarm" \
  -H "X-AgentBud-Step: analyze-intent" \
  -H "X-AgentBud-Provider: ollama" \
  -d '{
    "model": "'"$OLLAMA_MODEL"'",
    "messages": [
      {
        "role": "user",
        "content": "Extract data from this blob.",
        "email": "omkar@example.com",
        "phone": "+1-555-0199",
        "credit_card": "4111-1111-1111-1111",
        "safe_field": "This should stay intact"
      }
    ]
  }')
echo "PII Redaction Test Executed. Check the UI payload to ensure 'email', 'phone', and 'credit_card' say [REDACTED]."


echo -e "\n\n✅ Edge Case Testing Complete! Head over to the Dashboard UI to see your fresh runs!"
