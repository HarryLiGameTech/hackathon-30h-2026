import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import ToolCallCard from './ToolCallCard';

interface MessageBubbleProps {
  message: ChatMessage;
}

const TypingIndicator: React.FC = () => (
  <span className="inline-flex items-center gap-1 ml-1">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse-dot"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
);

const UserBubble: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex justify-end animate-slide-up">
    <div className="max-w-[75%] lg:max-w-[65%]">
      <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  </div>
);

const AssistantBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const hasSteps = (message.steps?.length ?? 0) > 0;

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md mt-1">
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
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-[80%] lg:max-w-[70%]">
        {/* Tool call steps */}
        {hasSteps && (
          <div className="mb-3 space-y-1.5">
            {message.steps!.map((step) => (
              <ToolCallCard key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* Message body */}
        {(message.content || message.streaming) && (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md">
            {message.content ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Style inline code
                    code: ({ children, className }) => {
                      const isBlock = className?.includes('language-');
                      if (isBlock) {
                        return (
                          <code className="block bg-gray-900 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre font-mono leading-relaxed">
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="bg-gray-700 text-blue-300 px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      );
                    },
                    // Style links
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        {children}
                      </a>
                    ),
                    // Style tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border-collapse">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="border border-gray-600 bg-gray-700 px-2 py-1 text-left font-semibold text-gray-200">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-gray-700 px-2 py-1 text-gray-300">
                        {children}
                      </td>
                    ),
                    // Style list items
                    li: ({ children }) => (
                      <li className="text-gray-200 leading-relaxed">{children}</li>
                    ),
                    p: ({ children }) => (
                      <p className="text-gray-200 leading-relaxed">{children}</p>
                    ),
                    h1: ({ children }) => (
                      <h1 className="text-gray-100 font-bold text-base mt-3 mb-1">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-gray-100 font-bold text-sm mt-3 mb-1">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-gray-200 font-semibold text-sm mt-2 mb-1">{children}</h3>
                    ),
                  }}
                >
                  {/* Strip <think>...</think> reasoning blocks and single backticks the LLM
                      wraps around technical identifiers (node IDs like `Floor1::Room405`,
                      command names, etc.) but preserve multi-line code blocks (```...```). */}
                  {message.content
                    .replace(/<think>[\s\S]*?<\/think>/g, '')
                    .replace(/`([^`]+)`/g, '$1')}
                </ReactMarkdown>
                {message.streaming && <TypingIndicator />}
              </div>
            ) : (
              <TypingIndicator />
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="text-gray-600 text-[10px] mt-1 ml-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  if (message.role === 'user') {
    return <UserBubble content={message.content} />;
  }
  return <AssistantBubble message={message} />;
};

export default MessageBubble;
