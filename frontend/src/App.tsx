import { useState } from 'react';
import RunExplorer from './components/RunExplorer';
import TraceWaterfall from './components/TraceWaterfall';
import CryptoInspector from './components/CryptoInspector';
import { ShieldCheck, Sun, Moon } from 'lucide-react';
import { useTheme } from './components/ThemeProvider';

function App() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    setSelectedTraceId(null);
  };

  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-[#010409] text-gray-800 dark:text-gray-300 font-sans overflow-hidden transition-colors">
      {/* Header */}
      <header className="flex-none h-14 bg-white dark:bg-[#161b22] border-b border-gray-200 dark:border-[#30363d] flex items-center px-4 gap-3 transition-colors">
        <ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-500" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">AgentBud</h1>
        <span className="text-sm font-mono text-gray-500 bg-gray-100 dark:bg-[#0d1117] px-2 py-1 rounded ml-2 transition-colors">v1.0 - Notary Engine Active</span>

        <div className="flex-1" />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#30363d] text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Main Dashboard Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Run Explorer Panel (1/4 width) */}
        <RunExplorer
          selectedRunId={selectedRunId}
          onSelectRun={handleSelectRun}
        />

        {/* Trace Waterfall Panel (Flexible) */}
        {selectedRunId ? (
          <TraceWaterfall
            runId={selectedRunId}
            selectedTraceId={selectedTraceId}
            onSelectTrace={setSelectedTraceId}
          />
        ) : (
          <div className="flex-1 max-w-[400px] border-r border-gray-200 dark:border-[#30363d] flex items-center justify-center p-8 text-center text-gray-400 dark:text-gray-500 transition-colors">
            Select an Agent Run from the sidebar to inspect its execution trajectory.
          </div>
        )}

        {/* Crypto Inspector Panel (Remaining Width) */}
        {selectedTraceId ? (
          <CryptoInspector traceId={selectedTraceId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm transition-colors">
            Select a trace node to view its cryptographic signature and payloads.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
