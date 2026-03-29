import React, { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ToolCallStep } from '../types';
import { streamChat, transformCommand } from '../api/client';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const ChatWindow: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSend = useCallback(
    (rawInput: string) => {
      if (isStreaming) return;

      const naturalQuery = transformCommand(rawInput);

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: rawInput,
        timestamp: Date.now(),
      };

      const assistantId = uuidv4();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        steps: [],
        streaming: true,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const inFlightTools = new Map<string, string>();

      streamChat(
        { message: naturalQuery, session_id: undefined },
        {
          onToolCallStart: (data) => {
            const stepId = uuidv4();
            inFlightTools.set(data.tool_name, stepId);
            const newStep: ToolCallStep = {
              id: stepId,
              toolName: data.tool_name,
              arguments: data.arguments,
              status: 'running',
              startedAt: Date.now(),
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, steps: [...(msg.steps ?? []), newStep] }
                  : msg
              )
            );
          },

          onToolCallEnd: (data) => {
            const stepId = inFlightTools.get(data.tool_name);
            if (!stepId) return;
            inFlightTools.delete(data.tool_name);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      steps: (msg.steps ?? []).map((s) =>
                        s.id === stepId
                          ? {
                              ...s,
                              result: data.result,
                              status: data.status as ToolCallStep['status'],
                              endedAt: Date.now(),
                            }
                          : s
                      ),
                    }
                  : msg
              )
            );
          },

          onContentDelta: (data) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + data.content }
                  : msg
              )
            );
          },

          onDone: () => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, streaming: false } : msg
              )
            );
            setIsStreaming(false);
          },

          onError: (err) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: `_Error: ${err.message}_`, streaming: false }
                  : msg
              )
            );
            setIsStreaming(false);
          },
        }
      );
    },
    [isStreaming]
  );

  const handleCancel = useCallback(() => {
    setIsStreaming(false);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        return prev.map((m) =>
          m.id === last.id
            ? { ...m, streaming: false, content: m.content || '_Response cancelled._' }
            : m
        );
      }
      return prev;
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-gray-700 bg-gray-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
          <span className="text-gray-300 text-sm font-medium">AI Assistant</span>
          {isStreaming && (
            <span className="text-yellow-400 text-xs animate-pulse">Thinking...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <button
              onClick={handleCancel}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 px-3 py-1 rounded-lg transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={handleClearHistory}
            disabled={isStreaming}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-3 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear chat
          </button>
        </div>
      </div>

      <MessageList messages={messages} />

      <MessageInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
};

export default ChatWindow;
