import { create } from 'zustand';
import type { Block, SessionState, Workout } from '../types';

type AppState = {
  workouts: Workout[];
  activeSessionId: string | null;
  activeDisplayCode: string | null;
  activeWorkout: Workout | null;
  sessionState: SessionState;

  setWorkouts: (workouts: Workout[]) => void;
  setActiveSession: (params: {
    sessionId: string | null;
    displayCode: string | null;
    workout: Workout | null;
    state?: SessionState;
  }) => void;
  setSessionState: (nextState: SessionState) => void;
  getEffectiveBlocks: () => Block[];
};

export const useAppStore = create<AppState>((set, get) => ({
  workouts: [],
  activeSessionId: null,
  activeDisplayCode: null,
  activeWorkout: null,
  sessionState: {},

  setWorkouts: (workouts) => set({ workouts }),

  setActiveSession: ({ sessionId, displayCode, workout, state }) =>
    set({
      activeSessionId: sessionId,
      activeDisplayCode: displayCode,
      activeWorkout: workout,
      sessionState: state ?? {}
    }),

  setSessionState: (nextState) => set({ sessionState: nextState }),

  getEffectiveBlocks: () => {
    const { activeWorkout, sessionState } = get();
    return sessionState.override?.blocks ?? activeWorkout?.blocks ?? [];
  }
}));
