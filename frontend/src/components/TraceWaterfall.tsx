import { useEffect, useState } from 'react';
import { GitCommit, Settings, Bot, Terminal } from 'lucide-react';
import type { Trace } from '../types';

interface TraceWaterfallProps {
    runId: string;
    selectedTraceId: string | null;
    onSelectTrace: (traceId: string) => void;
}

interface TraceNode extends Trace {
    children: TraceNode[];
}

export default function TraceWaterfall({ runId, selectedTraceId, onSelectTrace }: TraceWaterfallProps) {
    const [traces, setTraces] = useState<Trace[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchTraces = () => {
        if (!runId) return;
        fetch(`/api/runs/${runId}`)
            .then(res => res.json())
            .then(data => {
                setTraces(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch traces", err);
                setLoading(false);
            });
    };

    useEffect(() => {
        if (!runId) return;
        setLoading(true); // Only show spinner on initial run load
        fetchTraces();

        // Establish SSE
        const eventSource = new EventSource('/api/events');

        eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                // Only refresh if the incoming trace belongs to the currently viewed run
                if (data.type === 'new-trace' && data.run_id === runId) {
                    fetchTraces();
                }
            } catch (err) {
                console.error("SSE parse error", err);
            }
        });

        eventSource.onerror = (err) => {
            console.error("SSE connection error in TraceWaterfall", err);
        };

        return () => {
            eventSource.close();
        };
    }, [runId]);

    // Build a tree of traces based on parent_step
    const buildTree = (flatTraces: Trace[]): TraceNode[] => {
        const map = new Map<string, TraceNode[]>();

        // First map children by parent_step name instead of traceparent id
        // This allows grouping sequential steps logically even if traceparents mutate
        flatTraces.forEach(t => {
            const parentName = t.parent_step && t.parent_step !== 'unknown' ? t.parent_step : 'root';
            if (!map.has(parentName)) {
                map.set(parentName, []);
            }
            map.get(parentName)!.push({ ...t, children: [] });
        });

        // Sort chronologically
        for (const [, nodes] of map.entries()) {
            nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }

        // Now build tree by matching 'step' name to 'parentName' map
        const attachChildren = (nodes: TraceNode[]) => {
            nodes.forEach(node => {
                const children = map.get(node.step);
                if (children) {
                    node.children = children;
                    attachChildren(node.children);
                }
            });
        };

        const roots: TraceNode[] = map.get('root') || [];
        attachChildren(roots);

        // If we have orphaned nodes (e.g., parent_step was set but parent doesn't exist in this run),
        // append them to roots so they don't disappear.
        const allAttachedIds = new Set<string>();
        const markAttached = (n: TraceNode) => {
            allAttachedIds.add(n.id);
            n.children.forEach(markAttached);
        }
        roots.forEach(markAttached);

        flatTraces.forEach(t => {
            if (!allAttachedIds.has(t.id) && t.parent_step !== 'root') {
                // It's an orphan
                roots.push({ ...t, children: [] });
            }
        });

        // Re-sort roots chronologically to interleave orphans properly
        roots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return roots;
    };

    const getStepIcon = (type: string) => {
        switch (type) {
            case 'reasoning': return <Bot className="w-4 h-4 text-blue-400" />;
            case 'tool-call': return <Settings className="w-4 h-4 text-green-400" />;
            case 'handoff': return <Terminal className="w-4 h-4 text-purple-400" />;
            default: return <GitCommit className="w-4 h-4 text-gray-400" />;
        }
    };

    const renderTraceNode = (node: TraceNode, depth = 0) => {
        const isSelected = selectedTraceId === node.id;
        return (
            <div key={node.id} className="w-full">
                <div
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1f2937] transition-colors ${isSelected ? 'bg-blue-50 dark:bg-[#1f2937] border-l-2 border-blue-500' : 'border-l-2 border-transparent'
                        }`}
                    style={{ paddingLeft: `calc(0.5rem + ${depth * 1.5}rem)` }}
                    onClick={() => onSelectTrace(node.id)}
                >
                    {getStepIcon(node.step_type)}
                    <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{node.step}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto whitespace-nowrap">
                        {new Date(node.timestamp).toLocaleTimeString()}
                    </span>
                </div>
                {node.children.map((child: TraceNode) => renderTraceNode(child, depth + 1))}
            </div>
        );
    };

    if (loading) {
        return <div className="flex-1 bg-white dark:bg-[#161b22] flex items-center justify-center text-gray-400">Loading traces...</div>;
    }

    const tree = buildTree(traces);

    return (
        <div className="flex-1 bg-white dark:bg-[#0d1117] border-r border-gray-200 dark:border-[#30363d] flex flex-col overflow-hidden max-w-[400px] transition-colors">
            <div className="p-4 border-b border-gray-200 dark:border-[#30363d]">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Trace Waterfall</h2>
                <div className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1 w-full truncate">{runId}</div>
            </div>
            <div className="flex-1 overflow-y-auto w-full p-2 space-y-1">
                {traces.length === 0 ? (
                    <div className="text-center text-gray-400 dark:text-gray-500 mt-4 text-sm">Select a run to view traces</div>
                ) : (
                    tree.map(node => renderTraceNode(node))
                )}
            </div>
        </div>
    );
}
