'use client';

import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  sidebarOpen: boolean; // mobile drawer
  pageTitle: string;
  pageSubtitle: string;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setPageMeta: (title: string, subtitle?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  sidebarOpen: false,
  pageTitle: 'Dashboard',
  pageSubtitle: '',

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setPageMeta: (title, subtitle = '') =>
    set({ pageTitle: title, pageSubtitle: subtitle }),
}));
