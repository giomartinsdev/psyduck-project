import React from 'react';
import Link from 'next/link';
import Markdown from 'react-markdown';
import styles from './ChatBubble.module.css';

interface ChatBubbleProps {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp?: string;
  isTyping?: boolean;
}

export function ChatBubble({ role, content, timestamp, isTyping }: ChatBubbleProps) {
  const isUser = role === 'USER';
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

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
            {isUser ? (
              <p className={styles.content}>{content}</p>
            ) : (
              <div className={styles.content}>
                <Markdown
                  components={{
                    p: ({ children }) => <p style={{ margin: '0 0 0.4em' }}>{children}</p>,
                    strong: ({ children }) => (
                      <strong style={{ color: 'var(--color-primary-light)' }}>{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em style={{ color: 'var(--color-text-muted)', fontSize: '0.85em' }}>{children}</em>
                    ),
                    ul: ({ children }) => (
                      <ul style={{ paddingLeft: '1.2em', margin: '0.3em 0' }}>{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: '0.25em' }}>{children}</li>
                    ),
                    // Internal links (/catalogue/...) → Next.js Link (no full reload)
                    // External links → plain <a> with target="_blank"
                    a: ({ href, children }) =>
                      href?.startsWith('/') ? (
                        <Link
                          href={href}
                          style={{
                            color: 'var(--color-primary-light)',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                          }}
                        >
                          {children}
                        </Link>
                      ) : (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--color-primary-light)', textDecoration: 'underline' }}>
                          {children}
                        </a>
                      ),
                  }}
                >
                  {content}
                </Markdown>
              </div>
            )}
            {time && <span className={styles.time}>{time}</span>}
          </>
        )}
      </div>
    </div>
  );
}
