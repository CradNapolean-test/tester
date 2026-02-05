'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { getSupabaseClient } from '../../../lib/supabase';

type Exercise = {
  id: string;
  name: string;
  prescription?: string;
  target?: string;
  notes?: string;
};

type Block = {
  id: string;
  title: string;
  exercises: Exercise[];
  meta?: {
    interval?: {
      workSec?: number;
      restSec?: number;
      rounds?: number;
    };
  };
};

type SessionState = {
  phase?: 'WORK' | 'REST';
  currentRound?: number;
  currentBlockIndex?: number;
  startTs?: string | null;
  pausedTs?: string | null;
  remainingMsAtPause?: number;
  override?: {
    blocks?: Block[] | null;
  };
};

type SessionRow = {
  id: string;
  title: string;
  display_code: string;
  workout_id: string;
  state: SessionState;
};

type WorkoutRow = {
  id: string;
  title: string;
  blocks: Block[];
};

function getInterval(block?: Block) {
  const interval = block?.meta?.interval;
  return {
    workSec: Math.max(1, Number(interval?.workSec ?? 30)),
    restSec: Math.max(1, Number(interval?.restSec ?? 15)),
    rounds: Math.max(1, Number(interval?.rounds ?? 8))
  };
}

function computeRemainingMs(state: SessionState, nowMs: number, fullMs: number) {
  const pausedTs = state.pausedTs;
  const remainingAtPause = Math.max(0, Number(state.remainingMsAtPause ?? fullMs));

  if (pausedTs) return remainingAtPause;
  if (!state.startTs) return fullMs;

  const elapsed = Math.max(0, nowMs - new Date(state.startTs).getTime());
  return Math.max(0, remainingAtPause - elapsed);
}

export default function SessionDisplayPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [session, setSession] = useState<SessionRow | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadInitial() {
      const { data, error: sessionError } = await supabase
        .from('sessions')
        .select('id,title,display_code,workout_id,state')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError || !data) {
        setError(sessionError?.message ?? 'Session not found');
        return;
      }

      const sessionRow = data as SessionRow;
      setSession(sessionRow);

      const { data: workoutData, error: workoutError } = await supabase
        .from('workouts')
        .select('id,title,blocks')
        .eq('id', sessionRow.workout_id)
        .maybeSingle();

      if (workoutError) {
        setError(workoutError.message);
      }

      setWorkout((workoutData as WorkoutRow | null) ?? null);
    }

    loadInitial();

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const next = payload.new as SessionRow;
          setSession((prev) => ({ ...(prev ?? next), ...next }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const blocks = useMemo(() => {
    return session?.state?.override?.blocks ?? workout?.blocks ?? [];
  }, [session, workout]);

  const currentBlockIndex = Math.max(0, Number(session?.state?.currentBlockIndex ?? 0));
  const currentRound = Math.max(1, Number(session?.state?.currentRound ?? 1));
  const currentBlock = blocks[currentBlockIndex];
  const interval = getInterval(currentBlock);

  const exerciseCount = Math.max(1, currentBlock?.exercises?.length ?? 0);
  const currentExerciseIndex = (currentRound - 1) % exerciseCount;
  const nextUpIndex = currentRound % exerciseCount;

  const currentExercise = currentBlock?.exercises?.[currentExerciseIndex] ?? null;
  const nextExercise =
    currentBlock?.exercises?.length && currentBlock.exercises.length > 1
      ? (currentBlock.exercises[nextUpIndex] ?? null)
      : null;

  const phase: 'WORK' | 'REST' | 'PAUSED' = session?.state?.pausedTs
    ? 'PAUSED'
    : (session?.state?.phase ?? 'WORK');

  const fullDurationMs = phase === 'REST' ? interval.restSec * 1000 : interval.workSec * 1000;
  const remainingMs = session?.state ? computeRemainingMs(session.state, nowMs, fullDurationMs) : fullDurationMs;
  const remainingSec = Math.ceil(remainingMs / 1000);

  if (error) {
    return (
      <main>
        <section className="card">
          <h1>Session Error</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <section className="card">
          <h1>Loading Session…</h1>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, opacity: 0.8 }}>Display Code: {session.display_code}</p>
        <h1 style={{ fontSize: 28, margin: '0.5rem 0 0.25rem' }}>{session.title || 'Live Session'}</h1>
        <p style={{ marginTop: 0, opacity: 0.85 }}>{workout?.title ?? 'Workout'}</p>

        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.05em', color: '#93c5fd' }}>{phase}</div>
        <div style={{ fontSize: 128, lineHeight: 1, fontWeight: 800 }}>
          {String(Math.floor(remainingSec / 60)).padStart(2, '0')}:{String(remainingSec % 60).padStart(2, '0')}
        </div>

        <div style={{ marginTop: 16, padding: 16, border: '1px solid #1f2937', borderRadius: 12, textAlign: 'left' }}>
          <p><strong>Block:</strong> {currentBlock?.title ?? '-'}</p>
          <p><strong>Round:</strong> {currentRound} / {interval.rounds}</p>
          <p><strong>Current:</strong> {currentExercise?.name ?? '-'}</p>
          <p><strong>Prescription:</strong> {currentExercise?.prescription ?? '-'}</p>
          <p><strong>Target:</strong> {currentExercise?.target ?? '-'}</p>
          {nextExercise ? (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#0f172a', border: '1px solid #334155' }}>
              <strong>NEXT:</strong> {nextExercise.name}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
