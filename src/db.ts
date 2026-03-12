import { Database } from 'bun:sqlite';
import * as path from 'node:path';

// Initialize DB
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'agentbud.db');
const db = new Database(dbPath, { create: true });

// Enable WAL mode for performance
db.exec('PRAGMA journal_mode = WAL;');

// Create table if it doesn't exist (clean first-time schema)
db.exec(`
  CREATE TABLE IF NOT EXISTS traces(
    id TEXT PRIMARY KEY,
    traceparent TEXT,
    run_id TEXT,
    workflow TEXT,
    step TEXT,
    parent_step TEXT,
    step_type TEXT,
    req_payload TEXT,
    res_payload TEXT,
    req_hash TEXT,
    res_hash TEXT,
    chain_hash TEXT,
    signature TEXT,
    status INTEGER,
    request_path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_traces_run_step ON traces(run_id, step);
  CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp);
`);

export interface TraceRecord {
  id: string;
  traceparent: string;
  run_id: string;
  workflow: string;
  step: string;
  parent_step: string;
  step_type: string;
  req_payload: string;
  res_payload: string;
  req_hash: string;
  res_hash: string;
  chain_hash: string;
  signature?: string;
  status: number;
  request_path?: string;
}

export function insertTrace(trace: TraceRecord) {
  const insert = db.prepare(`
    INSERT INTO traces(
  id, traceparent, run_id, workflow, step, parent_step, step_type,
  req_payload, res_payload, req_hash, res_hash, chain_hash, signature, status, request_path
) VALUES(
  $id, $traceparent, $run_id, $workflow, $step, $parent_step, $step_type,
  $req_payload, $res_payload, $req_hash, $res_hash, $chain_hash, $signature, $status, $request_path
)
  `);

  insert.run({
    $id: trace.id,
    $traceparent: trace.traceparent,
    $run_id: trace.run_id,
    $workflow: trace.workflow,
    $step: trace.step,
    $parent_step: trace.parent_step,
    $step_type: trace.step_type,
    $req_payload: trace.req_payload,
    $res_payload: trace.res_payload,
    $req_hash: trace.req_hash,
    $res_hash: trace.res_hash,
    $chain_hash: trace.chain_hash,
    $signature: trace.signature || null,
    $status: trace.status,
    $request_path: trace.request_path || '/v1/chat/completions'
  });
}

export function getPreviousChainHash(): string {
  // Get the most recent chain_hash chronologically
  const query = db.prepare(`SELECT chain_hash FROM traces ORDER BY timestamp DESC LIMIT 1`);
  const result = query.get() as { chain_hash: string } | null;
  // If no previous hash exists, use a seed of 64 zeros
  return result?.chain_hash || '0000000000000000000000000000000000000000000000000000000000000000';
}

export function getConsecutiveRepeats(runId: string, step: string): number {
  // Loop detection circuit breaker query
  const query = db.prepare(`SELECT step FROM traces WHERE run_id = $run_id ORDER BY timestamp DESC`);
  const results = query.all({ $run_id: runId }) as { step: string }[];

  let count = 0;
  for (const row of results) {
    if (row.step === step) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function getRuns() {
  const query = db.prepare(`
        SELECT run_id, workflow, COUNT(id) as total_steps, MAX(timestamp) as latest_timestamp
        FROM traces
        GROUP BY run_id, workflow
        ORDER BY latest_timestamp DESC
  `);
  return query.all();
}

export function getRunTraces(runId: string) {
  const query = db.prepare(`
SELECT * FROM traces
        WHERE run_id = $run_id
        ORDER BY timestamp ASC
    `);
  return query.all({ $run_id: runId });
}

export function getTrace(id: string) {
  const query = db.prepare(`SELECT * FROM traces WHERE id = $id`);
  return query.get({ $id: id }) as TraceRecord | null;
}
