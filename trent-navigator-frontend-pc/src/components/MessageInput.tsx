import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
} from 'react';
import type { CommandDefinition } from '../types';
import { COMMANDS } from '../types';
import CommandHints from './CommandHints';

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled = false }) => {
  const [value, setValue] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [hintFilter, setHintFilter] = useState('');
  const [selectedHintIndex, setSelectedHintIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const filteredCommands = COMMANDS.filter((c) =>
    c.name.toLowerCase().startsWith(hintFilter.toLowerCase())
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setValue(v);

      if (v.startsWith('/')) {
        const word = v.split(/\s/)[0];
        setHintFilter(word);
        setShowHints(true);
        setSelectedHintIndex(0);
      } else {
        setShowHints(false);
      }
    },
    []
  );

  const handleSelectCommand = useCallback((cmd: CommandDefinition) => {
    setValue(cmd.usage.replace('[', '').replace(']', '') + ' ');
    setShowHints(false);
    textareaRef.current?.focus();
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    setShowHints(false);
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showHints && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedHintIndex((i) => (i + 1) % filteredCommands.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedHintIndex((i) =>
            (i - 1 + filteredCommands.length) % filteredCommands.length
          );
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          handleSelectCommand(filteredCommands[selectedHintIndex]);
          return;
        }
        if (e.key === 'Escape') {
          setShowHints(false);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [showHints, filteredCommands, selectedHintIndex, handleSelectCommand, submit]
  );

  const isEmpty = value.trim().length === 0;
  const isCommand = value.trimStart().startsWith('/');

  return (
    <div className="px-4 md:px-8 py-4 border-t border-gray-700 bg-gray-900">
      {/* Command mode badge */}
      {isCommand && !showHints && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
            Command mode
          </span>
          <span className="text-xs text-gray-500">
            Press Enter to execute
          </span>
        </div>
      )}

      <div className="relative">
        {/* Command autocomplete */}
        {showHints && (
          <CommandHints
            commands={COMMANDS}
            filter={hintFilter}
            onSelect={handleSelectCommand}
            selectedIndex={selectedHintIndex}
          />
        )}

        {/* Input area */}
        <div
          className={`flex items-end gap-3 bg-gray-800 border rounded-2xl px-4 py-3 transition-colors ${
            disabled
              ? 'border-gray-700 opacity-60'
              : 'border-gray-600 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/30'
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              disabled
                ? 'Waiting for response...'
                : 'Ask about Trent Building, or type / for commands...'
            }
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 resize-none outline-none text-sm leading-relaxed min-h-[24px] max-h-[160px]"
          />

          <button
            onClick={submit}
            disabled={isEmpty || disabled}
            className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isEmpty || disabled
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-500/25'
            }`}
            aria-label="Send message"
          >
            {disabled ? (
              // Spinner
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Hint text */}
        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-gray-600 text-[10px]">
            Enter to send · Shift+Enter for newline · Type / for commands
          </span>
          {value.length > 0 && (
            <span className="text-gray-600 text-[10px]">{value.length}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
