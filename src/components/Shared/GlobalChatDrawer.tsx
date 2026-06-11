import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { MessageSquare, X, Send, Brain, Loader2, Plus } from 'lucide-react';
import MarkdownWithHighlight from './MarkdownWithHighlight';
import api, { isHostManagedUnavailable } from '../../api';
import { useChatTopics, type ChatMessage } from '../../hooks/useChatTopics';
import { createStreamEventHandler } from '../../hooks/useChatStream';
import { useI18n } from '../../i18n';
import { getErrorMessage, isAbortError } from '../../utils/error';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface GlobalChatAPI {
  openChat: () => void;
  close: () => void;
  toggle: () => void;
  newTopic: () => void;
  isOpen: boolean;
}

const GlobalChatContext = createContext<GlobalChatAPI>({
  openChat: () => {},
  close: () => {},
  toggle: () => {},
  newTopic: () => {},
  isOpen: false,
});

export const useGlobalChat = () => useContext(GlobalChatContext);

const uid = () => Math.random().toString(36).substring(2, 10);

interface ChatInternalState {
  messages: ChatMsg[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  chatHistoryRef: React.MutableRefObject<{ role: string; content: string }[]>;
  close: () => void;
}

const ChatStateContext = createContext<ChatInternalState>(null!);

/** Shared read access for panels that need the global chat state. */
export const useChatState = () => useContext(ChatStateContext);

export const GlobalChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const chatHistoryRef = useRef<{ role: string; content: string }[]>([]);

  const openChat = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  const newTopic = useCallback(() => {
    setMessages([]);
    chatHistoryRef.current = [];
  }, []);

  const ctxValue: GlobalChatAPI = { openChat, close, toggle, newTopic, isOpen };
  const internalState: ChatInternalState = {
    messages,
    setMessages,
    loading,
    setLoading,
    chatHistoryRef,
    close,
  };

  return (
    <GlobalChatContext.Provider value={ctxValue}>
      <ChatStateContext.Provider value={internalState}>
        {children}
      </ChatStateContext.Provider>
    </GlobalChatContext.Provider>
  );
};

export const GlobalChatPanel: React.FC = () => {
  const { t, lang } = useI18n();
  const { messages, setMessages, loading, setLoading, chatHistoryRef, close } = useContext(ChatStateContext);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');

  const topicsMgr = useChatTopics();
  const panelTopicIdRef = useRef<string | null>(null);
  const isSwitchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isSwitchingRef.current) return;
    if (panelTopicIdRef.current && messages.length > 0) {
      topicsMgr.saveTopic(panelTopicIdRef.current, messages as unknown as ChatMessage[]);
    }
  }, [messages]);

  const ensurePanelTopic = useCallback(() => {
    if (!panelTopicIdRef.current) {
      isSwitchingRef.current = true;
      const id = topicsMgr.createTopic();
      panelTopicIdRef.current = id;
      setTimeout(() => { isSwitchingRef.current = false; }, 50);
    }
  }, [topicsMgr]);

  const handleNewTopic = useCallback(() => {
    panelTopicIdRef.current = null;
    setMessages([]);
    chatHistoryRef.current = [];
  }, [setMessages, chatHistoryRef]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 200); }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    ensurePanelTopic();
    setInput('');
    setMessages(prev => [...prev, { id: uid(), role: 'user', content: text, timestamp: Date.now() }]);
    setLoading(true);

    chatHistoryRef.current.push({ role: 'user', content: text });
    const assistantId = uid();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: t('globalChat.system.thinking'), timestamp: Date.now() }]);

    const abort = new AbortController();
    abortRef.current = abort;

    const { onEvent, getState } = createStreamEventHandler(assistantId, setMessages, t);
    let answerText = '';

    try {
      const result = await api.chatStream(text, chatHistoryRef.current, (evt) => {
        onEvent(evt);
        answerText = getState().answerText;
      }, abort.signal, lang);

      const finalText = result.text || answerText;
      chatHistoryRef.current.push({ role: 'model', content: finalText });
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: finalText } : m));
    } catch (err: unknown) {
      if (isAbortError(err)) {
        const { answerText: partialText, toolLogs } = getState();
        const partial = partialText || (toolLogs.length > 0 ? toolLogs.join('\n') + '\n\n' + t('globalChat.system.cancelled') : t('globalChat.system.cancelled'));
        if (partialText) chatHistoryRef.current.push({ role: 'model', content: partialText });
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: partial } : m));
      } else {
        const content = isHostManagedUnavailable(err)
          ? t('globalChat.hostManagedChatUnavailable')
          : t('globalChat.requestFailed', { error: getErrorMessage(err) });
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content } : m));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, [input, loading, ensurePanelTopic, setMessages, setLoading, chatHistoryRef, t, lang]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <aside className="w-[420px] h-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] flex flex-col shrink-0">
      <div className="px-4 h-[var(--topbar-height)] border-b border-[var(--border-default)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center">
            <MessageSquare className="text-blue-600" size={16} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-[var(--fg-primary)] flex items-center gap-2">
              {t('globalChat.chatTitle')}
            </h3>
            <p className="text-[10px] text-[var(--fg-muted)] truncate max-w-[250px]">
              {t('globalChat.chatSubtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={handleNewTopic}
              className="p-1.5 hover:bg-[var(--bg-subtle)] rounded-lg transition-colors" title={t('globalChat.newTopic')}>
              <Plus size={16} className="text-[var(--fg-muted)]" />
            </button>
          )}
          <button onClick={close} className="p-1.5 hover:bg-[var(--bg-subtle)] rounded-lg transition-colors" title={t('globalChat.closeChat')}>
            <X size={16} className="text-[var(--fg-muted)]" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 scrollbar-light">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
              <MessageSquare className="text-blue-500" size={20} />
            </div>
            <h4 className="text-sm font-bold text-[var(--fg-primary)] mb-1">{t('globalChat.emptyTitle')}</h4>
            <p className="text-xs text-[var(--fg-muted)] max-w-[280px] leading-relaxed mb-3">{t('globalChat.emptyDesc')}</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {[t('globalChat.quickPrompts.analyzeArch'), t('globalChat.quickPrompts.findDuplicates'), t('globalChat.quickPrompts.suggestOptimize')].map(p => (
                <button key={p} onClick={() => { setInput(p); inputRef.current?.focus(); }}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] text-[var(--fg-secondary)] hover:bg-blue-50 hover:text-blue-700 transition-colors">{p}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] ${
              msg.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-tr-md px-3.5 py-2'
                : msg.role === 'system' ? 'bg-[var(--bg-subtle)] border border-[var(--border-default)] text-[var(--fg-secondary)] rounded-2xl px-3.5 py-2 w-full'
                : 'bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl rounded-tl-md px-3.5 py-2.5 shadow-sm w-full'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Brain size={12} className="text-blue-500" />
                  <span className="text-[10px] font-bold text-blue-600">
                    {t('globalChat.assistantChat')}
                  </span>
                </div>
              )}
              {msg.role === 'assistant' ? (
                <MarkdownWithHighlight content={msg.content} className="text-xs text-[var(--fg-primary)]" />
              ) : (
                <p className={`text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? '' : 'text-[var(--fg-secondary)]'}`}>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl rounded-tl-md px-3.5 py-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-blue-500" />
                <span className="text-xs text-[var(--fg-secondary)]">{t('globalChat.loading.thinking')}</span>
                {abortRef.current && (
                  <button onClick={() => abortRef.current?.abort()}
                    className="ml-1 px-1.5 py-0.5 text-[10px] font-bold text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors">
                    {t('globalChat.stopBtn')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="px-4 py-2.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={t('globalChat.chatPlaceholder')} rows={2}
            className="flex-1 px-3 py-2 text-sm border border-[var(--border-default)] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none placeholder:text-[var(--fg-muted)]"
            disabled={loading} />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="self-stretch w-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shrink-0">
            <Send size={14} />
          </button>
        </div>
        <p className="text-[9px] text-[var(--fg-muted)] mt-1">
          {t('globalChat.inputHintChat')}
        </p>
      </div>
    </aside>
  );
};

export default GlobalChatProvider;
