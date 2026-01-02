"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ToastContainer";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.2:8000";

const PREDEFINED_PROMPTS = [
  "Help me debug an issue",
  "Suggest best practices",
  "Generate project ideas",
  "Review my code",
];

const ThinkBuddyAssistant = ({ projects = [] }) => {
  const { user, getIdToken } = useAuth();
  const { showConfirm } = useToast();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const availableProjects = projects.length > 0 ? projects : [];

  // Function to format message text with bold headings
  const formatMessageText = (text) => {
    if (!text) return null;

    // Remove all asterisks
    let formattedText = text.replace(/\*/g, '');

    // Split by lines
    const lines = formattedText.split('\n');

    return lines.map((line, index) => {
      let trimmedLine = line.trim();

      // Skip lines that are just subheadings
      if (/^(summary|important points|key points|main topics|answer|solution|steps|recommendations):?\s*$/i.test(trimmedLine)) {
        return null;
      }

      // Remove subheading prefixes from the beginning of lines
      trimmedLine = trimmedLine.replace(/^(summary|important points|key points|main topics|answer|solution|steps|recommendations):\s*/i, '');

      // Check if line is a heading (starts with a number followed by period or dash, or contains colon at end)
      const isHeading = /^\d+[\.\)]\s/.test(trimmedLine) ||
        /^[-•]\s/.test(trimmedLine) ||
        /^[A-Z][^:]{2,30}:\s*$/.test(trimmedLine);

      if (!trimmedLine) {
        return <br key={index} />;
      }

      if (isHeading) {
        return (
          <p key={index} className="font-bold mt-2 mb-1">
            {trimmedLine}
          </p>
        );
      }

      return (
        <p key={index} className="mb-1">
          {trimmedLine}
        </p>
      );
    });
  };

  // Load chat history when project changes
  useEffect(() => {
    loadChatHistory();
  }, [selectedProject]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const loadChatHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();

      const projectId = selectedProject?.teamId;
      const url = projectId
        ? `${API_BASE_URL}/api/assistant/history?project_id=${projectId}`
        : `${API_BASE_URL}/api/assistant/history`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to load chat history');

      const data = await response.json();

      if (data.history && data.history.length > 0) {
        const formattedMessages = data.history.map((msg, idx) => ({
          id: idx,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        }));
        setMessages(formattedMessages);
      } else {
        // Welcome message
        setMessages([{
          id: 1,
          role: "assistant",
          content: projectId
            ? `Hello! I'm ThinkBuddy. I can help you with questions about ${selectedProject?.teamName}. I have access to all team messages and can provide context-aware assistance!`
            : "Hello! I'm ThinkBuddy, your AI assistant. Select a project to get started with context-aware assistance!",
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      setError('Failed to load chat history');
      setMessages([{
        id: 1,
        role: "assistant",
        content: "Hello! I'm ThinkBuddy, your AI assistant. How can I help you today?",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (customMessage) => {
    const messageToSend = customMessage || inputMessage.trim();
    if (!messageToSend || isTyping) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: messageToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsTyping(true);
    setError(null);

    try {
      const token = await getIdToken();
      const projectId = selectedProject?.teamId;

      const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: messageToSend,
          project_context: projectId,
          use_rag: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get response');
      }

      const data = await response.json();

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp,
        sources: data.sources || []
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setError(error.message);

      // Add error message
      const errorMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handlePredefinedPrompt = (prompt) => {
    handleSendMessage(prompt);
  };

  const clearChatHistory = async () => {
    showConfirm(
      'Are you sure you want to clear the chat history for this project?',
      async () => {
        try {
          const token = await getIdToken();
          const projectId = selectedProject?.teamId;
          const url = projectId
            ? `${API_BASE_URL}/api/assistant/clear-history?project_id=${projectId}`
            : `${API_BASE_URL}/api/assistant/clear-history`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) throw new Error('Failed to clear history');

          // Reset messages with welcome message
          setMessages([{
            id: 1,
            role: "assistant",
            content: "Chat history cleared! How can I help you?",
            timestamp: new Date().toISOString()
          }]);
        } catch (error) {
          console.error('Error clearing history:', error);
          setError('Failed to clear chat history');
        }
      }
    );
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };


  return (
    <div className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                ThinkBuddy {selectedProject ? `- ${selectedProject.teamName}` : ""}
              </h2>
              <p className="text-xs text-gray-500">
                {selectedProject
                  ? `Context-aware AI with access to ${selectedProject.teamName} messages`
                  : "Your AI-powered productivity companion"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {availableProjects.length > 0 && (
              <>
                <span className="text-sm font-medium text-gray-700">Project:</span>
                <select
                  value={selectedProject?.teamId || ""}
                  onChange={(e) => {
                    const project = availableProjects.find(p => p.teamId === e.target.value);
                    setSelectedProject(project || null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white text-sm shadow-sm text-gray-900 font-medium hover:border-purple-400 transition-colors"
                >
                  <option value="">General Chat</option>
                  {availableProjects.map((project) => (
                    <option key={project.teamId} value={project.teamId}>
                      {project.teamName}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              onClick={clearChatHistory}
              className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
              title="Clear chat history"
            >
              Clear History
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-6 mt-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-3xl ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                    : 'bg-gradient-to-br from-purple-500 to-indigo-600'
                    } shadow-md`}>
                    {message.role === 'user' ? (
                      <span className="text-white text-sm font-medium">
                        {user?.displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                  </div>

                  {/* Message Content */}
                  <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${message.role === 'user'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                      : message.isError
                        ? 'bg-red-50 text-red-900 border border-red-200'
                        : 'bg-white text-gray-900 border border-gray-200'
                      }`}>
                      {message.role === 'user' ? (
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      ) : (
                        <div className="text-sm leading-relaxed">
                          {formatMessageText(message.content)}
                        </div>
                      )}
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2">📚 Sources from team messages:</p>
                          <div className="space-y-1">
                            {message.sources.slice(0, 3).map((source, idx) => (
                              <div key={idx} className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                                <span className="font-medium">{source.sender}:</span> {source.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 mt-1 px-1">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-3 max-w-3xl">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl shadow-sm">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-4 shadow-lg">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Predefined Prompts */}
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_PROMPTS.map((prompt, index) => (
              <button
                key={index}
                onClick={() => handlePredefinedPrompt(prompt)}
                disabled={isTyping}
                className="bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Field */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything... (Press Enter to send, Shift+Enter for new line)"
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none shadow-sm text-gray-900 placeholder:text-gray-400"
                rows="1"
                style={{ minHeight: '48px', maxHeight: '120px' }}
                disabled={isTyping}
              />
            </div>
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isTyping}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:cursor-not-allowed"
            >
              {isTyping ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            ThinkBuddy can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ThinkBuddyAssistant;
