import { create } from 'zustand';

export type RewardModalType = '7days' | 'lucky_spin' | 'bonus' | 'jackpot' | 'vip' | null;

interface RewardStoreState {
  activeModal: RewardModalType;
  openModal: (modal: RewardModalType) => void;
  closeModal: () => void;
}

export const useRewardStore = create<RewardStoreState>((set) => ({
  activeModal: null,
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
}));
