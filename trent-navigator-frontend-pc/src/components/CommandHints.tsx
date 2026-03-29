import React from 'react';
import type { CommandDefinition } from '../types';

interface CommandHintsProps {
  commands: CommandDefinition[];
  filter: string;
  onSelect: (command: CommandDefinition) => void;
  selectedIndex: number;
}

const CommandHints: React.FC<CommandHintsProps> = ({
  commands,
  filter,
  onSelect,
  selectedIndex,
}) => {
  const filtered = commands.filter((c) =>
    c.name.toLowerCase().startsWith(filter.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-hidden animate-fade-in z-10">
      <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          Commands
        </span>
      </div>
      {filtered.map((cmd, idx) => (
        <button
          key={cmd.name}
          className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
            idx === selectedIndex
              ? 'bg-blue-600/30 border-l-2 border-blue-500'
              : 'hover:bg-gray-700/50 border-l-2 border-transparent'
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 font-mono font-semibold text-sm">
                {cmd.name}
              </span>
              <span className="text-gray-300 text-sm">{cmd.description}</span>
            </div>
            <div className="text-gray-500 text-xs mt-0.5 font-mono">
              {cmd.usage}
            </div>
            <div className="text-gray-600 text-xs mt-0.5 italic">
              e.g. {cmd.example}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default CommandHints;
