import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WorkflowStep {
    stepType: string;
    provider?: string;
    baseUrl?: string;
    hashInput?: boolean;
    hashOutput?: boolean;
    redactPII?: string[];
    humanInTheLoop?: boolean;
    maxRepeats?: number;
}

export interface Workflow {
    steps: Record<string, WorkflowStep>;
}

export interface CryptoConfig {
    mode: 'none' | 'simple' | 'asymmetric';
    hashAlgo: string;
    signAlgo: string;
    keyDir: string;
}

export interface GlobalConfig {
    hashAlgo: string; // Legacy fallback
    chainHashes: boolean;
    autoDetectLoops: boolean;
    provider?: string;
    baseUrl?: string;
    crypto?: CryptoConfig; // New robust crypto configuration
}

export interface AgentConfig {
    global: GlobalConfig;
    workflows: Record<string, Workflow>;
}

let cachedConfig: AgentConfig | null = null;
let watcherInitialized = false;

export function loadConfig(configPath: string = path.join(process.cwd(), 'agent-config.yaml')): AgentConfig {
    // Setup hot-reloading background poller using fs.watchFile
    // Polling is required because file system events (inotify) often don't traverse 
    // correctly across macOS-to-Docker volume boundaries when editors swap inodes.
    if (!watcherInitialized) {
        fs.watchFile(configPath, { interval: 1000 }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs && curr.mtimeMs !== 0) {
                console.log(`\n🔄 [Config] Detected change in ${configPath}. Hot-reloading...`);
                try {
                    const fileContents = fs.readFileSync(configPath, 'utf8');
                    cachedConfig = yaml.load(fileContents) as AgentConfig;
                    console.log(`✅ [Config] Hot-reload successful. New rules active.\n`);
                } catch (e) {
                    console.error(`❌ [Config] Hot-reload error:`, e);
                }
            }
        });
        watcherInitialized = true;
    }

    if (cachedConfig) {
        return cachedConfig;
    }

    try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        const data = yaml.load(fileContents) as AgentConfig;
        cachedConfig = data;
        return data;
    } catch (e) {
        console.error(`Failed to load config from ${configPath}:`, e);
        throw e;
    }
}

export function getConfig(): AgentConfig {
    if (!cachedConfig) {
        return loadConfig();
    }
    return cachedConfig;
}

export function getWorkflowStep(workflowName: string, stepName: string): WorkflowStep | null {
    const config = getConfig();
    if (!config.workflows[workflowName]) return null;
    return config.workflows[workflowName].steps[stepName] || null;
}
