import React from 'react';
import styles from './ChatBubble.module.css';

interface ChatBubbleProps {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp?: string;
  isTyping?: boolean;
}

export function ChatBubble({ role, content, timestamp, isTyping }: ChatBubbleProps) {
  const isUser = role === 'USER';
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className={`${styles.wrapper} ${isUser ? styles.wrapperUser : styles.wrapperAI}`}>
      {!isUser && (
        <div className={styles.aiAvatar} aria-hidden>✦</div>
      )}
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAI}`}>
        {isTyping ? (
          <span className={styles.typingIndicator}>
            <span /><span /><span />
          </span>
        ) : (
          <>
            <p className={styles.content}>{content}</p>
            {time && <span className={styles.time}>{time}</span>}
          </>
        )}
      </div>
    </div>
  );
}
