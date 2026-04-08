import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axios'; // Using the established axios instance
import { FiX, FiSend, FiTrash2 } from 'react-icons/fi';

const SparkleRobotIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8" y2="16" />
    <line x1="16" y1="16" x2="16" y2="16" />
    <path d="M21 16l2-2" />
    <path d="M1 16l-2-2" />
  </svg>
);

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewSuggestion, setHasNewSuggestion] = useState(true);
  
  const [inputMessage, setInputMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState('');
  
  const messagesEndRef = useRef(null);

  // Check auth to render at all
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) return;
    
    // Load persisted history
    const saved = localStorage.getItem('ai_chat_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }

    // Fetch suggestions
    const fetchSuggestions = async () => {
      try {
        const res = await api.get('/ai/suggested-questions', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data && res.data.questions) {
          setSuggestedQuestions(res.data.questions);
        }
      } catch (err) {
        console.error("Could not fetch suggestions");
      }
    };
    fetchSuggestions();
  }, [token]);

  useEffect(() => {
    const handleOpenAI = () => setIsOpen(true);
    window.addEventListener('open-ai-assistant', handleOpenAI);
    return () => window.removeEventListener('open-ai-assistant', handleOpenAI);
  }, []);

  useEffect(() => {
    // Scroll to bottom whenever history changes
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (history.length > 0) {
      localStorage.setItem('ai_chat_history', JSON.stringify(history));
    } else {
      localStorage.removeItem('ai_chat_history');
    }
  }, [history]);

  if (!token) return null;

  const togglePanel = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setHasNewSuggestion(false);
  };

  const clearHistory = () => {
    setHistory([]);
    setErrorStatus('');
  };

  const sendMessage = async (text) => {
    const msg = text.trim();
    if (!msg || isLoading) return;

    setErrorStatus('');
    setInputMessage('');
    
    const newUserMsg = { role: 'user', content: msg };
    const newDoc = [...history, newUserMsg];
    
    setHistory(newDoc);
    setIsLoading(true);

    // Limit sent history to last 10
    const sentHistory = newDoc.length > 10 ? newDoc.slice(-10) : newDoc;
    // Don't include the exact message we're sending in the history array we pass to the server to prevent duplicates
    const serverHistory = sentHistory.slice(0, -1);

    try {
      const response = await api.post('/ai/query', {
        message: msg,
        conversation_history: serverHistory
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const assistantMsg = { 
        role: 'assistant', 
        content: response.data.reply 
      };
      setHistory(prev => [...prev, assistantMsg]);
    } catch (err) {
      setErrorStatus("Assistant unavailable. Try again.");
      // Rollback or note failure implicitly via state
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMessage);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      
      {/* Floating Chat Panel */}
      {isOpen && (
        <div 
          className="absolute bottom-20 right-0 w-[90vw] sm:w-[380px] h-[520px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all animate-in slide-in-from-bottom-5 fade-in duration-300"
          style={{ transformOrigin: 'bottom right' }}
        >
          {/* Header */}
          <div className="bg-blue-900 border-b border-blue-800 p-4 flex justify-between items-center text-white shrink-0">
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-2">
                <SparkleRobotIcon />
                <h3 className="font-bold text-lg leading-none tracking-wide">Inventory Assistant ✦</h3>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={clearHistory} 
                  title="Clear conversation"
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <FiTrash2 size={16} />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900 flex flex-col gap-4">
            {history.length === 0 && !isLoading && !errorStatus && (
              <div className="text-center text-gray-500 text-sm mt-8 px-4">
                <div className="inline-flex justify-center items-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 mb-4">
                  <SparkleRobotIcon />
                </div>
                <p className="font-semibold mb-1 text-gray-700 dark:text-gray-300">How can I help you today?</p>
                <p className="text-xs">I can analyze exact inventory data, find alerts, and draft reports.</p>
              </div>
            )}

            {history.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div 
                  key={idx} 
                  className={`flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200 ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      isUser 
                      ? 'bg-blue-600 text-white rounded-br-sm' 
                      : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-700 rounded-bl-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 px-1">
                    {/* Timestamp is mocked directly to 'now' visual mapping for simplicity unless persisted */}
                    {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              );
            })}

            {/* Error Message */}
            {errorStatus && (
              <div className="flex justify-center my-2">
                <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-3 py-1.5 rounded-full">
                  {errorStatus}
                </span>
              </div>
            )}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex flex-col items-start">
                <div className="bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1 w-16">
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-[bounce_1s_infinite_-0.3s]"></span>
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-[bounce_1s_infinite_-0.15s]"></span>
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-[bounce_1s_infinite]"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions (Empty State) */}
          {history.length === 0 && !isLoading && suggestedQuestions.length > 0 && (
            <div className="px-3 pb-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-2 pt-3 h-32 overflow-y-auto shrink-0 hide-scrollbar">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-1">Suggestions</span>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-left text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-full px-3 py-1.5 transition-colors shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3 shrink-0">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Ask about inventory..."
                className="w-full bg-gray-100 dark:bg-gray-900 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 rounded-full pl-4 pr-12 py-3 text-sm text-gray-900 dark:text-white outline-none transition-all placeholder-gray-400"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button 
                onClick={() => sendMessage(inputMessage)}
                disabled={!inputMessage.trim() || isLoading}
                className="absolute right-1.5 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-full transition-colors flex items-center justify-center pointer-events-auto"
              >
                <FiSend size={14} className="ml-0.5" />
              </button>
            </div>
          </div>
          
        </div>
      )}

      {/* Floating Trigger Button */}
      <button 
        onClick={togglePanel}
        className="w-14 h-14 bg-blue-900 hover:bg-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-500/30"
      >
        <SparkleRobotIcon />
        
        {/* Notification Dot */}
        {hasNewSuggestion && !isOpen && (
          <span className="absolute top-0 right-0 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-blue-900 bg-green-500"></span>
          </span>
        )}
      </button>

      {/* Basic CSS hiding scrollbars on webkit just for cleanliness */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
