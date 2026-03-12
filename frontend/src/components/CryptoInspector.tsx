import { useEffect, useState } from 'react';
import { ShieldCheck, FileJson, Link, ShieldAlert, Play, RefreshCw } from 'lucide-react';
import type { Trace } from '../types';

interface CryptoInspectorProps {
    traceId: string | null;
}

export default function CryptoInspector({ traceId }: CryptoInspectorProps) {
    const [trace, setTrace] = useState<Trace | null>(null);
    const [loading, setLoading] = useState(false);
    const [replaying, setReplaying] = useState(false);

    useEffect(() => {
        if (!traceId) {
            setTrace(null);
            return;
        }
        setLoading(true);
        fetch(`/api/traces/${traceId}`)
            .then(res => res.json())
            .then(data => {
                setTrace(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch trace", err);
                setLoading(false);
            });
    }, [traceId]);

    if (loading) {
        return <div className="flex-1 bg-white dark:bg-[#0d1117] flex items-center justify-center text-gray-400">Loading trace details...</div>;
    }

    if (!trace) {
        return <div className="flex-1 bg-white dark:bg-[#0d1117] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Select a trace to view details</div>;
    }

    const parseOrRaw = (data: string) => {
        if (!data) return 'No payload';
        try {
            return JSON.stringify(JSON.parse(data), null, 2);
        } catch {
            return data;
        }
    };

    const handleReplay = async () => {
        if (!trace) return;
        const apiKey = prompt("AgentBud does not store your API credentials.\n\nEnter API Key to replay this specific trajectory (leave blank for unauthenticated loop):");

        // If user cancelled prompt entirely
        if (apiKey === null) return;

        setReplaying(true);
        try {
            const res = await fetch(`/api/traces/${trace.id}/replay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });
            const data = await res.json();

            if (res.ok) {
                alert(`Replay successful! New Trace created in Run: ${data.run_id}\nTarget status: ${data.status}`);
            } else {
                alert(`Replay failed: ${data.error || res.statusText}\n${data.message || ''}`);
            }
        } catch (err) {
            alert(`Error triggering replay: ${err}`);
        } finally {
            setReplaying(false);
            // Reload traces could be handled here or by emitting an event, but simple alert is enough for now.
        }
    };

    const isHashValid = trace.chain_hash && trace.chain_hash !== '';

    return (
        <div className="flex-1 bg-white dark:bg-[#0d1117] flex flex-col overflow-hidden h-full text-sm transition-colors">
            <div className="p-4 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    Cryptography & Payload
                </h2>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleReplay}
                        disabled={replaying}
                        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 rounded-md border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {replaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        <span className="text-xs font-semibold tracking-wider">{replaying ? 'Looping...' : 'Replay Trace'}</span>
                    </button>

                    <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d] mx-1"></div>

                    <div className="flex items-center gap-3">
                        {isHashValid ? (
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-900">
                                <ShieldCheck className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Notary Valid</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 px-3 py-1.5 rounded-full border border-yellow-200 dark:border-yellow-900">
                                <ShieldAlert className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Unverified</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Split Pane View */}
            <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">

                {/* Left Pane - Payloads */}
                <div className="w-full md:w-3/5 border-b md:border-b-0 md:border-r border-gray-200 dark:border-[#30363d] flex flex-col overflow-hidden">
                    <div className="h-1/2 border-b border-gray-200 dark:border-[#30363d] flex flex-col">
                        <div className="bg-gray-50 dark:bg-[#161b22] px-3 py-2 border-b border-gray-200 dark:border-[#30363d] font-mono text-xs text-blue-600 dark:text-blue-300 flex items-center gap-2">
                            <FileJson className="w-4 h-4" /> Request Payload
                        </div>
                        <pre className="p-4 overflow-auto flex-1 font-mono text-xs text-green-700 dark:text-green-300 bg-white dark:bg-transparent">
                            {parseOrRaw(trace.req_payload)}
                        </pre>
                    </div>

                    <div className="h-1/2 flex flex-col bg-white dark:bg-[#010409]">
                        <div className="bg-gray-50 dark:bg-[#161b22] px-3 py-2 border-b border-gray-200 dark:border-[#30363d] font-mono text-xs text-purple-600 dark:text-purple-300 flex items-center gap-2">
                            <FileJson className="w-4 h-4" /> Response Payload
                        </div>
                        <pre className="p-4 overflow-auto flex-1 font-mono text-xs text-gray-800 dark:text-gray-300">
                            {parseOrRaw(trace.res_payload)}
                        </pre>
                    </div>
                </div>

                {/* Right Pane - Notary Seal */}
                <div className="w-full md:w-2/5 p-4 overflow-y-auto space-y-6">
                    <div>
                        <h3 className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Link className="w-3 h-3" /> Step Signatures
                        </h3>

                        <div className="space-y-4">
                            <div className="bg-gray-50 dark:bg-[#161b22] rounded p-3 border border-gray-200 dark:border-[#30363d]">
                                <div className="text-xs text-gray-600 dark:text-gray-500 mb-1">Request Content Hash (SHA-256)</div>
                                <div className="font-mono text-[10px] break-all text-blue-600 dark:text-blue-300">
                                    {trace.req_hash || 'No hash configured'}
                                </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-[#161b22] rounded p-3 border border-gray-200 dark:border-[#30363d]">
                                <div className="text-xs text-gray-600 dark:text-gray-500 mb-1">Response Content Hash (SHA-256)</div>
                                <div className="font-mono text-[10px] break-all text-purple-600 dark:text-purple-300">
                                    {trace.res_hash || 'No hash configured'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Cryptographic Chain
                        </h3>
                        <div className="bg-green-50 dark:bg-[#05110c] rounded p-4 border border-green-200 dark:border-green-900/50 relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-green-500/10 blur-xl rounded-full translate-x-1/2 -translate-y-1/2" />
                            <div className="text-xs text-green-700 dark:text-green-500 mb-1">Notary Seal (Chain Hash)</div>
                            <div className="font-mono text-xs break-all text-green-800 dark:text-green-300 relative z-10 leading-relaxed font-bold">
                                {trace.chain_hash || 'Chaining Disabled'}
                            </div>
                            {isHashValid && (
                                <div className="mt-3 text-[10px] text-green-800/70 dark:text-green-600/70 border-t border-green-200 dark:border-green-900/30 pt-2 relative z-10">
                                    Valid mathematical cryptographic link established to prior execution trajectory step.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Asymmetric Signature Block */}
                    {trace.signature && (
                        <div>
                            <h3 className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-blue-500" /> Ed25519 Signature
                            </h3>
                            <div className="bg-blue-50 dark:bg-[#0d1624] rounded p-4 border border-blue-200 dark:border-blue-900/50 relative overflow-hidden">
                                <div className="absolute right-0 bottom-0 w-24 h-24 bg-blue-500/10 blur-xl rounded-full translate-x-1/2 translate-y-1/2" />
                                <div className="text-xs text-blue-700 dark:text-blue-500 mb-1">Private Key Attestation</div>
                                <div className="font-mono text-[10px] break-all text-blue-800 dark:text-blue-300 relative z-10 leading-relaxed">
                                    {trace.signature}
                                </div>
                                <div className="mt-3 text-[10px] text-blue-800/70 dark:text-blue-600/70 border-t border-blue-200 dark:border-blue-900/30 pt-2 relative z-10">
                                    Tamper-proof signature generated by AgentBud's local asymmetric keypair.
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <h3 className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                            Metadata
                        </h3>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between border-b border-gray-200 dark:border-[#30363d] pb-1">
                                <span className="text-gray-600 dark:text-gray-500">Traceparent ID</span>
                                <span className="font-mono text-gray-800 dark:text-gray-300 truncate w-32 ml-2" title={trace.traceparent}>{trace.traceparent}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-200 dark:border-[#30363d] pb-1">
                                <span className="text-gray-600 dark:text-gray-500">HTTP Status</span>
                                <span className={`font-mono font-medium ${trace.status >= 400 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{trace.status}</span>
                            </div>
                            <div className="flex justify-between pb-1">
                                <span className="text-gray-600 dark:text-gray-500">Timestamp</span>
                                <span className="text-gray-800 dark:text-gray-300">{new Date(trace.timestamp).toISOString()}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
