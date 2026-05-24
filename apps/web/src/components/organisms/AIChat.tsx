'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useMutation, gql } from '@apollo/client';
import { ChatBubble } from '../molecules/ChatBubble';
import { Button } from '../atoms/Button';
import styles from './AIChat.module.css';

const SEND_MESSAGE = gql`
  mutation sendAIMessage($input: SendAIMessageInput!) {
    sendAIMessage(input: $input) {
      message { id role content createdAt }
      conversation { id }
    }
  }
`;

interface Message { id: string; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string; }

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [sendMessage, { loading }] = useMutation(SEND_MESSAGE);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || loading) return;
    setInput('');

    const userMsg: Message = { id: `tmp-${Date.now()}`, role: 'USER', content, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const { data } = await sendMessage({ variables: { input: { conversationId, content } } });
      const { message, conversation } = data.sendAIMessage;
      setConversationId(conversation.id);
      setIsTyping(false);
      setMessages(prev => [...prev, message]);
    } catch {
      setIsTyping(false);
      setMessages(prev => [...prev, { id: 'err', role: 'ASSISTANT', content: 'Sorry, I encountered an error. Please try again.', createdAt: new Date().toISOString() }]);
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const suggestions = [
    'Recommend headphones for remote work',
    'What\'s on sale this week?',
    'Check my order history',
    'I need a gaming monitor under R$4000',
  ];

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.aiOrb}>✦</div>
            <h2 className={styles.emptyTitle}>Your AI Shopping Companion</h2>
            <p className={styles.emptySubtitle}>Ask me anything about our products, your orders, or get personalised recommendations.</p>
            <div className={styles.suggestions}>
              {suggestions.map(s => (
                <button key={s} className={styles.suggestion} onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <ChatBubble key={msg.id} role={msg.role} content={msg.content} timestamp={msg.createdAt} />
          ))
        )}
        {isTyping && <ChatBubble role="ASSISTANT" content="" isTyping />}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <input
          ref={inputRef}
          id="ai-chat-input"
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your AI companion..."
          aria-label="Message input"
          disabled={loading}
        />
        <Button id="ai-chat-send" onClick={handleSend} isLoading={loading} disabled={!input.trim()} size="md">
          Send
        </Button>
      </div>
    </div>
  );
}
