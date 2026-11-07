'use client';

import { createContext, useContext, useRef, type KeyboardEvent } from 'react';
import styles from './WalletTabs.module.css';

export type WalletTabId = 'expenses' | 'members' | 'closure' | 'balance' | 'repayments';

// « all » : valeur par défaut hors onglets, tout le contenu est affiché.
const WalletTabContext = createContext<WalletTabId | 'all'>('all');

export const WalletTabProvider = WalletTabContext.Provider;

// Le détail prévient la page (WalletBalance) qui détient le statut : elle se recharge et passe
// en lecture seule (en-tête, onglets, bilan). Hors page, l'appel ne fait rien.
const WalletClosedContext = createContext<(message: string) => void>(() => undefined);

export const WalletClosedProvider = WalletClosedContext.Provider;

export function useWalletClosed() {
  return useContext(WalletClosedContext);
}

export function useWalletTab() {
  return useContext(WalletTabContext);
}

export function tabId(id: WalletTabId) {
  return `wallet-tab-${id}`;
}

export const WALLET_PANEL_ID = 'wallet-tabpanel';

type Props = {
  tabs: { id: WalletTabId; label: string }[];
  active: WalletTabId;
  onChange: (id: WalletTabId) => void;
};

export function WalletTabs({ tabs, active, onChange }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div className={styles.tabList} role="tablist" aria-label="Sections du porte-monnaie">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => { refs.current[tab.id] = element; }}
          id={tabId(tab.id)}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-controls={WALLET_PANEL_ID}
          tabIndex={tab.id === active ? 0 : -1}
          className={tab.id === active ? `${styles.tab} ${styles.active}` : styles.tab}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
