'use client';

import React, { useEffect, useRef } from 'react';
import { useAI } from '../../context/AIContext';
import { useAuth } from '../../context/AuthContext';
import { AIChat } from '../organisms/AIChat';
import styles from './AIDrawer.module.css';

export function AIFloatingButton() {
  const { isDrawerOpen, toggleDrawer } = useAI();

  return (
    <button
      className={`${styles.fab} ${isDrawerOpen ? styles.fabActive : ''}`}
      onClick={toggleDrawer}
      aria-label="Toggle AI shopping companion"
      title="Ask AI Companion"
      id="ai-fab-toggle"
    >
      ✦
    </button>
  );
}

export function AISidebarDrawer() {
  const { isDrawerOpen, closeDrawer } = useAI();
  const { user } = useAuth();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus trap or click-outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isDrawerOpen &&
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('#ai-fab-toggle') &&
        !(event.target as HTMLElement).closest('#nav-ai-chat-btn')
      ) {
        closeDrawer();
      }
    }

    // Escape key closes drawer
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isDrawerOpen) {
        closeDrawer();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawerOpen, closeDrawer]);

  return (
    <>
      {/* Background blur overlay */}
      {isDrawerOpen && (
        <div className={styles.overlay} onClick={closeDrawer} aria-hidden="true" />
      )}

      {/* Side drawer panel */}
      <div
        ref={drawerRef}
        className={`${styles.drawer} ${isDrawerOpen ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI shopping companion panel"
      >
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <div className={styles.orb}>✦</div>
            <div>
              <h2 className={styles.title}>AI Companion</h2>
              <p className={styles.status}>
                {user ? `Signed in as ${user.name}` : 'Guest shopping mode'}
              </p>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={closeDrawer}
            aria-label="Close AI panel"
            id="ai-drawer-close"
          >
            &times;
          </button>
        </div>
        <div className={styles.content}>
          <AIChat />
        </div>
      </div>
    </>
  );
}
