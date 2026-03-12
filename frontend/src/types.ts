export interface Run {
    run_id: string;
    workflow: string;
    total_steps: number;
    latest_timestamp: string;
}

export interface Trace {
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
    timestamp: string;
}
