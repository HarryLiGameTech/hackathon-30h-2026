import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
}

const EmptyState: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
    {/* Building icon */}
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-xl">
      <svg
        className="w-9 h-9 text-white"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        />
      </svg>
    </div>

    <div>
      <h2 className="text-xl font-bold text-gray-100 mb-2">
        Trent Building Navigator
      </h2>
      <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
        Ask me anything about the Trent Building — navigation, room info, or
        building queries. You can also use slash commands for quick actions.
      </p>
    </div>

    {/* Quick command examples */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl mt-2">
      {[
        {
          icon: '🗺️',
          label: 'Navigate',
          example: '/navigate grand gate room 405',
        },
        { icon: 'ℹ️', label: 'Node Info', example: '/info Arabina' },
        {
          icon: '🔍',
          label: 'Query',
          example: '/query ArabinaRestaurant closingTime',
        },
      ].map(({ icon, label, example }) => (
        <div
          key={label}
          className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 text-left"
        >
          <div className="text-lg mb-1">{icon}</div>
          <div className="text-gray-200 font-semibold text-sm">{label}</div>
          <div className="text-gray-500 text-xs font-mono mt-1 break-all">
            {example}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
