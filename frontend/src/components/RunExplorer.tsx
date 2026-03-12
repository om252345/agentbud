import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import type { Run } from '../types';

interface RunExplorerProps {
    selectedRunId: string | null;
    onSelectRun: (runId: string) => void;
}

export default function RunExplorer({ selectedRunId, onSelectRun }: RunExplorerProps) {
    const [runs, setRuns] = useState<Run[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRuns = () => {
        fetch('/api/runs')
            .then(res => res.json())
            .then(data => {
                setRuns(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch runs", err);
                setLoading(false);
            });
    };

    useEffect(() => {
        // Initial fetch
        fetchRuns();

        // Establish Server-Sent Events (SSE) connection for real-time updates
        const eventSource = new EventSource('/api/events');

        eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'new-trace') {
                    // Refetch runs when a new trace comes in to update counts/timestamps
                    fetchRuns();
                }
            } catch (err) {
                console.error("SSE parse error", err);
            }
        });

        eventSource.onerror = (err) => {
            console.error("SSE connection error in RunExplorer", err);
        };

        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <div className="w-1/4 min-w-[300px] border-r border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] h-full flex flex-col overflow-hidden transition-colors">
            <div className="p-4 border-b border-gray-200 dark:border-[#30363d] flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Runs</h2>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-2 space-y-1">
                {loading ? (
                    <div className="text-center text-gray-500 p-4">Loading runs...</div>
                ) : runs.length === 0 ? (
                    <div className="text-center text-gray-400 p-4 text-sm">No runs available</div>
                ) : (
                    runs.map(run => (
                        <button
                            key={run.run_id}
                            onClick={() => onSelectRun(run.run_id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedRunId === run.run_id
                                ? 'bg-blue-50 dark:bg-[#1f2937] border-blue-200 dark:border-blue-500/50'
                                : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-[#161b22]'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-mono text-xs text-blue-600 dark:text-blue-400 truncate w-32">{run.run_id.substring(0, 13)}</span>
                                <span className="text-xs text-gray-500">{new Date(run.latest_timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{run.workflow}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{run.total_steps} steps</div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
