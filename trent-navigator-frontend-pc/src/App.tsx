import React, { useState } from 'react';
import { COMMANDS } from './types';
import ChatWindow from './components/ChatWindow';

const Sidebar: React.FC<{ collapsed: boolean; onToggle: () => void }> = ({
  collapsed,
  onToggle,
}) => {
  return (
    <aside
      className={`shrink-0 flex flex-col bg-gray-950 border-r border-gray-800 transition-all duration-300 ${
        collapsed ? 'w-14' : 'w-64'
      }`}
    >
      {/* Logo / brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-white font-bold text-sm leading-tight truncate">
              Trent Building
            </div>
            <div className="text-blue-400 text-xs truncate">Navigator</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Commands reference */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold mb-3 px-1">
            Slash Commands
          </div>
          <div className="space-y-2">
            {COMMANDS.map((cmd) => (
              <div
                key={cmd.name}
                className="rounded-lg bg-gray-900 border border-gray-800 p-3"
              >
                <div className="text-blue-400 font-mono text-xs font-semibold mb-1">
                  {cmd.name}
                </div>
                <div className="text-gray-400 text-xs leading-snug">
                  {cmd.description}
                </div>
                <div className="text-gray-600 text-[10px] font-mono mt-1.5 leading-relaxed">
                  {cmd.usage}
                </div>
                <div className="text-gray-700 text-[10px] italic mt-1">
                  e.g. {cmd.example}
                </div>
              </div>
            ))}
          </div>

          {/* Building info */}
          <div className="mt-6 px-1">
            <div className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold mb-3">
              About
            </div>
            <p className="text-gray-600 text-xs leading-relaxed">
              AI-powered navigation and information system for the Trent
              Building. Powered by LangGraph + MCP tools.
            </p>
          </div>
        </div>
      )}

      {/* Collapsed state — icon-only shortcuts */}
      {collapsed && (
        <div className="flex-1 flex flex-col items-center pt-4 gap-3">
          {[
            { label: 'Navigate', icon: '🗺️' },
            { label: 'Info', icon: 'ℹ️' },
            { label: 'Query', icon: '🔍' },
          ].map(({ label, icon }) => (
            <div
              key={label}
              title={label}
              className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-sm cursor-default"
            >
              {icon}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={`px-4 py-3 border-t border-gray-800 ${collapsed ? 'hidden' : ''}`}>
        <div className="text-gray-700 text-[10px] text-center">
          Trent Building Navigator v1.0
        </div>
      </div>
    </aside>
  );
};

const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ChatWindow />
      </main>
    </div>
  );
};

export default App;
