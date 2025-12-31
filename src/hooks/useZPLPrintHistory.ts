import { useState, useEffect, useCallback } from 'react';

export interface ZPLPrintHistoryItem {
  id: string;
  fileName: string;
  labelType: string;
  labelSubtype: string | null;
  labelCount: number;
  zplCode: string;
  width: string;
  height: string;
  dpi: string;
  createdAt: number;
}

const STORAGE_KEY = 'zpl_print_history';
const MAX_ITEMS = 10;
const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 horas

export function useZPLPrintHistory() {
  const [history, setHistory] = useState<ZPLPrintHistoryItem[]>([]);

  // Carregar histórico do localStorage e limpar itens expirados
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed: ZPLPrintHistoryItem[] = JSON.parse(stored);
        const now = Date.now();
        // Filtrar itens não expirados
        const validItems = parsed.filter(item => (now - item.createdAt) < EXPIRATION_MS);
        setHistory(validItems);
        // Atualizar localStorage se houver itens removidos
        if (validItems.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(validItems));
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const addToHistory = useCallback((item: Omit<ZPLPrintHistoryItem, 'id' | 'createdAt'>) => {
    setHistory(prev => {
      const newItem: ZPLPrintHistoryItem = {
        ...item,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      
      // Adicionar no início e manter apenas os últimos MAX_ITEMS
      const updated = [newItem, ...prev].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Calcular tempo restante para expiração
  const getTimeRemaining = useCallback((createdAt: number) => {
    const now = Date.now();
    const elapsed = now - createdAt;
    const remaining = EXPIRATION_MS - elapsed;
    
    if (remaining <= 0) return 'Expirado';
    
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
    getTimeRemaining,
  };
}
