import { customAlphabet } from 'nanoid';
import { supabase } from './supabase';
import type { SessionState, Workout } from '../types';

const codeAlphabet = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4);

export function makeDisplayCode(): string {
  return codeAlphabet();
}

export async function listWorkouts(): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id,title,blocks,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Workout[]) ?? [];
}

export async function upsertWorkout(workout: Workout): Promise<Workout> {
  const payload = {
    id: workout.id,
    title: workout.title,
    blocks: workout.blocks
  };

  const { data, error } = await supabase
    .from('workouts')
    .upsert(payload, { onConflict: 'id' })
    .select('id,title,blocks,created_at,updated_at')
    .single();

  if (error) throw error;
  return data as Workout;
}

export async function createSession(workout: Workout, title: string) {
  if (!workout.id) {
    throw new Error('Cannot create session: workout.id is required');
  }

  const display_code = makeDisplayCode();
  const initialState: SessionState = {
    currentBlockIndex: 0,
    currentExerciseIndex: 0,
    override: {}
  };

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      workout_id: workout.id,
      title,
      display_code,
      state: initialState
    })
    .select('id,workout_id,title,display_code,state,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionState(sessionId: string, nextState: SessionState) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ state: nextState })
    .eq('id', sessionId)
    .select('id,workout_id,title,display_code,state,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}
