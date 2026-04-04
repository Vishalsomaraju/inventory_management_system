import React, { useState, useRef, useEffect } from 'react';
import api from '../lib/api';

const SUGGESTED_PROMPTS = [
  "What products are running low?",
  "Which vendor should I reorder from?",
  "Summarize today's stock movements",
  "Which items need a purchase order?"
];

const AIChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const bottomRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  const handleSend = async (text) => {
    if (!text.trim()) return;
    
    // 1. Add user message
    const userMsg = { role: 'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);

    try {
      // 2. Fetch context
      const contextRes = await api.get('/analytics/ai-context').catch(() => ({ data: {} })); // Safely fallback if unimplemented
      
      // 3. Post to AI
      const chatRes = await api.post('/ai/chat', {
        message: text,
        context: contextRes.data,
        history: messages // pass history before this interaction
      });

      // 4. Add AI response
      const aiResponseText = chatRes.data?.response || chatRes.data?.content || chatRes.data || "I'm sorry, I encountered an error and couldn't process that request.";
      setMessages([...newHistory, { role: 'assistant', content: typeof aiResponseText === 'string' ? aiResponseText : JSON.stringify(aiResponseText) }]);
    } catch (error) {
      setMessages([...newHistory, { role: 'assistant', content: "An error occurred connecting to the AI assistant. " + (error.response?.data?.detail || "") }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => setMessages([]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-xl flex items-center justify-center transition-transform transform ${isOpen ? 'scale-0' : 'scale-100'}`}
        aria-label="Open AI Assistant"
      >
        <svg className="w-7 h-7 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 md:right-6 w-[calc(100vw-2rem)] md:w-96 h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-[slideUp_0.2s_ease-out]">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="font-bold tracking-wide">AI Inventory Assistant</h3>
            </div>
            <div className="flex gap-2">
              <button onClick={handleClear} className="text-purple-200 hover:text-white px-2 py-1 text-xs font-semibold rounded bg-white/10 hover:bg-white/20 transition-colors">
                Clear
              </button>
              <button onClick={() => setIsOpen(false)} className="text-purple-200 hover:text-white p-1 rounded hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center text-center space-y-6 animate-[fadeIn_0.5s_ease-out]">
                <div className="space-y-2">
                  <div className="mx-auto w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex justify-center items-center mb-4 shadow-inner">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h4 className="font-semibold text-gray-800">How can I help you today?</h4>
                  <p className="text-xs text-gray-500 max-w-[250px]">
                    I can act as an AI overlay evaluating your exact warehouse state, answering questions about pending shortages and identifying PO priorities.
                  </p>
                </div>
                <div className="w-full flex flex-col gap-2">
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(prompt)}
                      className="text-left px-4 py-2.5 text-sm bg-white border border-purple-100 rounded-xl shadow-sm text-purple-700 hover:bg-purple-50 hover:border-purple-200 transition-all font-medium"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 text-sm shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-purple-600 text-white rounded-2xl rounded-tr-sm' 
                      : 'bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex gap-1.5 items-center justify-center">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} className="h-1 shrink-0" />
          </div>

          {/* Input Area */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }} 
            className="p-3 bg-white border-t border-gray-100 shrink-0"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Ask about your inventory..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-shadow text-sm"
                disabled={isLoading}
              />
              <button 
                type="submit" 
                disabled={!input.trim() || isLoading}
                className="absolute right-2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                title="Send Message"
              >
                <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </div>
          </form>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html:`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}}/>
    </>
  );
};

export default AIChat;
