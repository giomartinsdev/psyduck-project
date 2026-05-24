'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useAI } from '../../context/AIContext';
import styles from './NavBar.module.css';

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { itemCount } = useCart();
  const { openDrawer } = useAI();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const navLinks = [
    { href: '/',           label: 'Home' },
    { href: '/catalogue',  label: 'Catalogue' },
    { href: '/orders',     label: 'Orders' },
    { href: '/ai',         label: '✦ AI Chat' },
  ];

  return (
    <nav className={styles.nav} id="main-nav">
      <div className={styles.inner}>
        {/* Logo */}
        <Link href="/" className={styles.logo} id="nav-logo">
          <span className={styles.logoIcon}>◈</span>
          <span className={styles.logoText}>TechStore</span>
        </Link>

        {/* Desktop nav links */}
        <ul className={styles.links}>
          {navLinks.map(link => (
            <li key={link.href}>
              {link.href === '/ai' ? (
                <button
                  id="nav-ai-chat-btn"
                  onClick={openDrawer}
                  className={styles.link}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center' }}
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  href={link.href}
                  className={`${styles.link} ${pathname === link.href ? styles.linkActive : ''}`}
                >
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>

        {/* Right-side actions */}
        <div className={styles.actions}>
          {/* Cart */}
          <Link href="/cart" className={styles.cartBtn} id="nav-cart" aria-label="Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            {itemCount > 0 && (
              <span className={styles.cartBadge} aria-label={`${itemCount} items`}>{itemCount}</span>
            )}
          </Link>

          {/* Auth */}
          {user ? (
            <div className={styles.userMenu}>
              <button
                className={styles.avatar}
                id="nav-user-avatar"
                onClick={() => setMenuOpen(p => !p)}
                aria-label="User menu"
              >
                {user.name.charAt(0).toUpperCase()}
              </button>
              {menuOpen && (
                <div className={styles.dropdown} role="menu">
                  <div className={styles.dropdownHeader}>
                    <span className={styles.dropdownName}>{user.name}</span>
                    <span className={styles.dropdownEmail}>{user.email}</span>
                  </div>
                  <Link href="/orders" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                    My Orders
                  </Link>
                  <button className={styles.dropdownSignOut} onClick={handleSignOut} id="nav-sign-out">
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/signin" className={styles.signInBtn} id="nav-sign-in">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
