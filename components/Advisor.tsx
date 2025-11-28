import React, { useState, useRef, useEffect } from 'react';
import { Transaction, Category } from '../types';
import { getFinancialAdvice } from '../services/geminiService';
import { Send, Sparkles } from 'lucide-react';

interface AdvisorProps {
  transactions: Transaction[];
  categories: Category[];
}

interface Message {
  role: 'user' | 'ai';
  content: string;
}

const Advisor: React.FC<AdvisorProps> = ({ transactions, categories }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: '我是你的财务顾问。请问有什么可以帮你？' }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleAsk = async () => {
    if (!query.trim() || loading) return;

    const userMsg = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    const response = await getFinancialAdvice(transactions, categories, userMsg);

    setMessages(prev => [...prev, { role: 'ai', content: response }]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full animate-slide-up pb-24">
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2 mb-4 scroll-smooth">
        
        {/* Intro */}
        <div className="flex justify-center py-8">
           <div className="bg-surface border border-border px-5 py-2.5 rounded-full flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-secondary">AI 财务顾问</span>
           </div>
        </div>

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] px-5 py-4 text-base leading-relaxed tracking-wide ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-2xl rounded-tr-sm'
                  : 'bg-surface border border-border text-primary rounded-2xl rounded-tl-sm'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
            <span className="text-xs text-zinc-300 mt-1.5 px-2">
                {msg.role === 'user' ? '你' : '智能顾问'}
            </span>
          </div>
        ))}
        
        {loading && (
          <div className="flex items-start">
             <div className="bg-surface border border-border px-5 py-4 rounded-2xl rounded-tl-sm flex gap-1.5">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce delay-75"></span>
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce delay-150"></span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="relative mt-auto">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="输入消息..."
          className="w-full bg-white border border-border text-primary rounded-2xl py-5 pl-5 pr-16 focus:ring-1 focus:ring-primary focus:border-primary transition-all text-base"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !query.trim()}
          className="absolute right-3 top-3 bottom-3 aspect-square bg-primary text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-primary transition-colors flex items-center justify-center"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Advisor;