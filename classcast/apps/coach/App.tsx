import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { nanoid } from 'nanoid/non-secure';

import type { Block, SessionState, Workout } from './src/types';
import { createSession, listWorkouts, updateSessionState, upsertWorkout } from './src/lib/api';
import { useAppStore } from './src/store/useAppStore';

type Screen = 'list' | 'editor' | 'session';
type Phase = 'WORK' | 'REST';

type IntervalConfig = {
  workSec: number;
  restSec: number;
  rounds: number;
};

function nowIso() {
  return new Date().toISOString();
}

function toMs(sec: number) {
  return Math.max(1, Math.floor(sec)) * 1000;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getIntervalConfig(block?: Block): IntervalConfig {
  const raw = (block?.meta as { interval?: Partial<IntervalConfig> } | undefined)?.interval;
  return {
    workSec: Math.max(1, Number(raw?.workSec ?? 30)),
    restSec: Math.max(1, Number(raw?.restSec ?? 15)),
    rounds: Math.max(1, Number(raw?.rounds ?? 8))
  };
}

function buildDefaultWorkout(): Workout {
  return {
    title: 'New Workout',
    blocks: [
      {
        id: nanoid(),
        title: 'Intervals',
        type: 'interval',
        exercises: [{ id: nanoid(), name: 'Row' }],
        meta: {
          interval: { workSec: 30, restSec: 15, rounds: 8 }
        }
      }
    ]
  };
}

function getSessionNumber(state: SessionState, key: string, fallback = 0): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getSessionString(state: SessionState, key: string): string | null {
  const value = state[key];
  return typeof value === 'string' ? value : null;
}

function computeRemainingMs(state: SessionState, nowMs: number, fullDurationMs: number) {
  const pausedTs = getSessionString(state, 'pausedTs');
  const remainingAtPause = getSessionNumber(state, 'remainingMsAtPause', fullDurationMs);

  if (pausedTs) return Math.max(0, remainingAtPause);

  const startTs = getSessionString(state, 'startTs');
  if (!startTs) return Math.max(0, fullDurationMs);

  const elapsed = Math.max(0, nowMs - new Date(startTs).getTime());
  return Math.max(0, remainingAtPause - elapsed);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('list');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [liveEditOpen, setLiveEditOpen] = useState(false);
  const [liveEditBlocks, setLiveEditBlocks] = useState<Block[] | null>(null);

  const {
    workouts,
    sessionState,
    activeWorkout,
    activeSessionId,
    activeDisplayCode,
    setWorkouts,
    setActiveSession,
    setSessionState,
    getEffectiveBlocks
  } = useAppStore();

  const [editorWorkout, setEditorWorkout] = useState<Workout>(buildDefaultWorkout());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    refreshWorkouts();
  }, []);

  const effectiveBlocks = getEffectiveBlocks();
  const currentBlockIndex = getSessionNumber(sessionState, 'currentBlockIndex', 0);
  const currentBlock = effectiveBlocks[currentBlockIndex];
  const interval = getIntervalConfig(currentBlock);
  const phase = (getSessionString(sessionState, 'phase') as Phase | null) ?? 'WORK';
  const currentRound = getSessionNumber(sessionState, 'currentRound', 1);
  const fullDurationMs = phase === 'WORK' ? toMs(interval.workSec) : toMs(interval.restSec);
  const remainingMs = computeRemainingMs(sessionState, nowMs, fullDurationMs);
  const remainingSec = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (screen !== 'session' || !activeSessionId) return;
    if (remainingMs > 0) return;

    let cancelled = false;
    (async () => {
      const next = computeNextSessionState();
      setSessionState(next);
      try {
        await updateSessionState(activeSessionId, next);
      } catch {
        if (!cancelled) {
          // best effort sync for MVP
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [remainingMs, screen, activeSessionId]);

  async function refreshWorkouts() {
    setLoading(true);
    try {
      const rows = await listWorkouts();
      setWorkouts(rows);
    } finally {
      setLoading(false);
    }
  }

  function startCreateWorkout() {
    setEditorWorkout(buildDefaultWorkout());
    setScreen('editor');
  }

  function startEditWorkout(workout: Workout) {
    const block = workout.blocks?.[0] ?? buildDefaultWorkout().blocks[0];
    setEditorWorkout({
      ...workout,
      blocks: [
        {
          ...block,
          exercises: block.exercises?.length ? block.exercises : [{ id: nanoid(), name: 'Exercise' }],
          meta: {
            ...block.meta,
            interval: {
              ...getIntervalConfig(block)
            }
          }
        }
      ]
    });
    setScreen('editor');
  }

  async function saveWorkoutFromEditor() {
    const first = editorWorkout.blocks[0] ?? buildDefaultWorkout().blocks[0];
    const intervalCfg = getIntervalConfig(first);

    const payload: Workout = {
      ...editorWorkout,
      title: editorWorkout.title.trim() || 'Untitled Workout',
      blocks: [
        {
          ...first,
          title: first.title || 'Intervals',
          type: 'interval',
          exercises: first.exercises?.length ? first.exercises : [{ id: nanoid(), name: 'Exercise' }],
          meta: {
            ...first.meta,
            interval: intervalCfg
          }
        }
      ]
    };

    setSaving(true);
    try {
      await upsertWorkout(payload);
      await refreshWorkouts();
      setScreen('list');
    } finally {
      setSaving(false);
    }
  }

  async function startSessionForWorkout(workout: Workout) {
    setSaving(true);
    try {
      const created = await createSession(workout, `${workout.title} Session`);
      const state = (created.state as SessionState | null) ?? {};
      setActiveSession({
        sessionId: created.id as string,
        displayCode: String(created.display_code ?? ''),
        workout,
        state: {
          phase: 'WORK',
          currentRound: 1,
          currentBlockIndex: 0,
          currentExerciseIndex: 0,
          remainingMsAtPause: toMs(getIntervalConfig(workout.blocks[0]).workSec),
          pausedTs: nowIso(),
          ...state
        }
      });
      setScreen('session');
    } finally {
      setSaving(false);
    }
  }

  function updateEditorTitle(title: string) {
    setEditorWorkout((prev) => ({ ...prev, title }));
  }

  function updateEditorInterval(partial: Partial<IntervalConfig>) {
    setEditorWorkout((prev) => {
      const first = prev.blocks[0] ?? buildDefaultWorkout().blocks[0];
      const nextCfg = { ...getIntervalConfig(first), ...partial };
      return {
        ...prev,
        blocks: [
          {
            ...first,
            meta: {
              ...first.meta,
              interval: nextCfg
            }
          }
        ]
      };
    });
  }

  function updateEditorExerciseName(name: string) {
    setEditorWorkout((prev) => {
      const first = prev.blocks[0] ?? buildDefaultWorkout().blocks[0];
      const firstExercise = first.exercises?.[0] ?? { id: nanoid(), name: '' };
      return {
        ...prev,
        blocks: [
          {
            ...first,
            exercises: [{ ...firstExercise, name }]
          }
        ]
      };
    });
  }

  function computeNextSessionState(): SessionState {
    const blocks = effectiveBlocks;
    const blockIdx = getSessionNumber(sessionState, 'currentBlockIndex', 0);
    const current = blocks[blockIdx];
    const cfg = getIntervalConfig(current);
    const round = getSessionNumber(sessionState, 'currentRound', 1);
    const currentPhase = (getSessionString(sessionState, 'phase') as Phase | null) ?? 'WORK';

    if (currentPhase === 'WORK') {
      return {
        ...sessionState,
        phase: 'REST',
        startTs: nowIso(),
        pausedTs: null,
        remainingMsAtPause: toMs(cfg.restSec)
      };
    }

    const nextRound = round + 1;
    if (nextRound <= cfg.rounds) {
      return {
        ...sessionState,
        phase: 'WORK',
        currentRound: nextRound,
        startTs: nowIso(),
        pausedTs: null,
        remainingMsAtPause: toMs(cfg.workSec)
      };
    }

    const nextBlockIndex = blockIdx + 1;
    const nextBlock = blocks[nextBlockIndex];
    if (nextBlock) {
      const nextCfg = getIntervalConfig(nextBlock);
      return {
        ...sessionState,
        phase: 'WORK',
        currentRound: 1,
        currentBlockIndex: nextBlockIndex,
        currentExerciseIndex: 0,
        startTs: nowIso(),
        pausedTs: null,
        remainingMsAtPause: toMs(nextCfg.workSec)
      };
    }

    return {
      ...sessionState,
      pausedTs: nowIso(),
      startTs: null,
      remainingMsAtPause: 0
    };
  }

  async function syncAndSet(next: SessionState) {
    setSessionState(next);
    if (activeSessionId) {
      await updateSessionState(activeSessionId, next);
    }
  }

  function openLiveEdit() {
    setLiveEditBlocks(deepClone(effectiveBlocks));
    setLiveEditOpen(true);
  }

  function updateLiveCurrentBlockTitle(title: string) {
    setLiveEditBlocks((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      const block = next[currentBlockIndex];
      if (!block) return prev;
      block.title = title;
      return next;
    });
  }

  function updateLiveCurrentInterval(partial: Partial<IntervalConfig>) {
    setLiveEditBlocks((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      const block = next[currentBlockIndex];
      if (!block) return prev;
      const cfg = getIntervalConfig(block);
      block.meta = {
        ...block.meta,
        interval: {
          ...cfg,
          ...partial
        }
      };
      return next;
    });
  }

  function updateLiveCurrentExercise(field: 'name' | 'prescription' | 'target' | 'notes', value: string) {
    setLiveEditBlocks((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      const block = next[currentBlockIndex];
      if (!block) return prev;
      const exIdx = currentExerciseIndexByRound;
      const existing = block.exercises?.[exIdx] ?? { id: nanoid(), name: '' };
      const exerciseWithExtras = existing as typeof existing & {
        prescription?: string;
        target?: string;
        notes?: string;
      };
      exerciseWithExtras[field] = value;
      if (!block.exercises?.length) {
        block.exercises = [exerciseWithExtras];
      } else {
        block.exercises[exIdx] = exerciseWithExtras;
      }
      return next;
    });
  }

  async function saveLiveEdits() {
    if (!liveEditBlocks) return;
    const next: SessionState = {
      ...sessionState,
      override: {
        ...(sessionState.override ?? {}),
        blocks: deepClone(liveEditBlocks)
      }
    };
    await syncAndSet(next);
    setLiveEditOpen(false);
  }

  async function clearLiveEdits() {
    const next: SessionState = {
      ...sessionState,
      override: {
        ...(sessionState.override ?? {}),
        blocks: null
      }
    };
    await syncAndSet(next);
    setLiveEditBlocks(null);
    setLiveEditOpen(false);
  }

  async function handleStartPause() {
    const pausedTs = getSessionString(sessionState, 'pausedTs');
    if (pausedTs) {
      const now = Date.now();
      const remainingAtPause = getSessionNumber(sessionState, 'remainingMsAtPause', fullDurationMs);
      await syncAndSet({
        ...sessionState,
        startTs: new Date(now).toISOString(),
        pausedTs: null,
        remainingMsAtPause: remainingAtPause
      });
      return;
    }

    const nextRemaining = computeRemainingMs(sessionState, Date.now(), fullDurationMs);
    await syncAndSet({
      ...sessionState,
      pausedTs: nowIso(),
      remainingMsAtPause: nextRemaining
    });
  }

  async function handleReset() {
    const cfg = getIntervalConfig(currentBlock);
    const initialMs = phase === 'WORK' ? toMs(cfg.workSec) : toMs(cfg.restSec);
    await syncAndSet({
      ...sessionState,
      pausedTs: nowIso(),
      startTs: null,
      remainingMsAtPause: initialMs
    });
  }

  async function handlePrev() {
    const nextBlockIndex = Math.max(0, currentBlockIndex - 1);
    const block = effectiveBlocks[nextBlockIndex];
    const cfg = getIntervalConfig(block);
    await syncAndSet({
      ...sessionState,
      currentBlockIndex: nextBlockIndex,
      currentExerciseIndex: 0,
      currentRound: 1,
      phase: 'WORK',
      startTs: null,
      pausedTs: nowIso(),
      remainingMsAtPause: toMs(cfg.workSec)
    });
  }

  async function handleNext() {
    const nextBlockIndex = Math.min(effectiveBlocks.length - 1, currentBlockIndex + 1);
    const block = effectiveBlocks[nextBlockIndex];
    const cfg = getIntervalConfig(block);
    await syncAndSet({
      ...sessionState,
      currentBlockIndex: nextBlockIndex,
      currentExerciseIndex: 0,
      currentRound: 1,
      phase: 'WORK',
      startTs: null,
      pausedTs: nowIso(),
      remainingMsAtPause: toMs(cfg.workSec)
    });
  }

  const editorFirstBlock = editorWorkout.blocks[0] ?? buildDefaultWorkout().blocks[0];
  const editorCfg = getIntervalConfig(editorFirstBlock);
  const editorExerciseName = editorFirstBlock.exercises?.[0]?.name ?? '';

  const exerciseCount = Math.max(1, currentBlock?.exercises?.length ?? 0);
  const currentExerciseIndexByRound = (Math.max(1, currentRound) - 1) % exerciseCount;
  const nextUpExerciseIndexByRound = Math.max(1, currentRound) % exerciseCount;

  const currentExercise = useMemo(() => {
    return currentBlock?.exercises?.[currentExerciseIndexByRound] ?? currentBlock?.exercises?.[0] ?? null;
  }, [currentBlock, currentExerciseIndexByRound]);

  const nextUpExercise = useMemo(() => {
    if (!currentBlock?.exercises?.length || currentBlock.exercises.length < 2) return null;
    return currentBlock.exercises[nextUpExerciseIndexByRound] ?? null;
  }, [currentBlock, nextUpExerciseIndexByRound]);

  const liveCurrentBlock = liveEditBlocks?.[currentBlockIndex];
  const liveCfg = getIntervalConfig(liveCurrentBlock);
  const liveExercise = useMemo(() => {
    const count = Math.max(1, liveCurrentBlock?.exercises?.length ?? 0);
    const idx = (Math.max(1, currentRound) - 1) % count;
    return liveCurrentBlock?.exercises?.[idx] ?? liveCurrentBlock?.exercises?.[0] ?? null;
  }, [liveCurrentBlock, currentRound]);

  return (
    <SafeAreaView style={styles.safe}>
      {screen === 'list' && (
        <View style={styles.screen}>
          <Text style={styles.h1}>Workouts</Text>
          <Pressable style={styles.primaryBtn} onPress={startCreateWorkout}>
            <Text style={styles.primaryBtnText}>Create Workout</Text>
          </Pressable>

          {loading ? (
            <ActivityIndicator />
          ) : (
            <FlatList
              data={workouts}
              keyExtractor={(item) => item.id ?? item.title}
              ListEmptyComponent={<Text style={styles.muted}>No workouts yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={styles.row}>
                    <Pressable style={styles.secondaryBtn} onPress={() => startEditWorkout(item)}>
                      <Text>Edit</Text>
                    </Pressable>
                    <Pressable style={styles.primaryBtn} onPress={() => startSessionForWorkout(item)} disabled={saving}>
                      <Text style={styles.primaryBtnText}>Start Session</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {screen === 'editor' && (
        <View style={styles.screen}>
          <Text style={styles.h1}>Workout Editor (MVP)</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} value={editorWorkout.title} onChangeText={updateEditorTitle} />

          <Text style={styles.label}>First Block Work Sec</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(editorCfg.workSec)}
            onChangeText={(t) => updateEditorInterval({ workSec: Number(t || 0) })}
          />

          <Text style={styles.label}>First Block Rest Sec</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(editorCfg.restSec)}
            onChangeText={(t) => updateEditorInterval({ restSec: Number(t || 0) })}
          />

          <Text style={styles.label}>First Block Rounds</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(editorCfg.rounds)}
            onChangeText={(t) => updateEditorInterval({ rounds: Number(t || 0) })}
          />

          <Text style={styles.label}>First Exercise Name</Text>
          <TextInput style={styles.input} value={editorExerciseName} onChangeText={updateEditorExerciseName} />

          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={() => setScreen('list')}>
              <Text>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={saveWorkoutFromEditor} disabled={saving}>
              <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save to Supabase'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {screen === 'session' && (
        <View style={styles.screen}>
          <View style={styles.headerRow}>
            <Text style={styles.h1}>Session (Coach Run)</Text>
            <Pressable style={styles.secondaryBtn} onPress={openLiveEdit}>
              <Text>Live Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.displayCode}>Display Code: {activeDisplayCode ?? '----'}</Text>

          <Text style={styles.phase}>{phase}</Text>
          <Text style={styles.timer}>{String(Math.floor(remainingSec / 60)).padStart(2, '0')}:{String(remainingSec % 60).padStart(2, '0')}</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{currentBlock?.title ?? 'No active block'}</Text>
            <Text>Exercise: {currentExercise?.name ?? '-'}</Text>
            {nextUpExercise ? <Text>Next up: {nextUpExercise.name}</Text> : null}
            <Text>Round: {currentRound} / {interval.rounds}</Text>
          </View>

          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryBtn} onPress={handlePrev}>
              <Text>Prev</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={handleStartPause}>
              <Text style={styles.primaryBtnText}>{getSessionString(sessionState, 'pausedTs') ? 'Start' : 'Pause'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleReset}>
              <Text>Reset</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleNext}>
              <Text>Next</Text>
            </Pressable>
          </View>

          <Pressable style={styles.secondaryBtn} onPress={() => setScreen('list')}>
            <Text>Back to Workouts</Text>
          </Pressable>

          {activeWorkout ? <Text style={styles.muted}>Workout: {activeWorkout.title}</Text> : null}
        </View>
      )}

      <Modal visible={liveEditOpen} transparent animationType="slide" onRequestClose={() => setLiveEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.h2}>Live Edit (applies immediately via session state)</Text>

              <Text style={styles.label}>Current Block Name</Text>
              <TextInput
                style={styles.input}
                value={liveCurrentBlock?.title ?? ''}
                onChangeText={updateLiveCurrentBlockTitle}
              />

              <Text style={styles.label}>Work Sec</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={String(liveCfg.workSec)}
                onChangeText={(t) => updateLiveCurrentInterval({ workSec: Number(t || 0) })}
              />

              <Text style={styles.label}>Rest Sec</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={String(liveCfg.restSec)}
                onChangeText={(t) => updateLiveCurrentInterval({ restSec: Number(t || 0) })}
              />

              <Text style={styles.label}>Rounds</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={String(liveCfg.rounds)}
                onChangeText={(t) => updateLiveCurrentInterval({ rounds: Number(t || 0) })}
              />

              <Text style={styles.label}>Exercise Name</Text>
              <TextInput
                style={styles.input}
                value={(liveExercise?.name as string | undefined) ?? ''}
                onChangeText={(t) => updateLiveCurrentExercise('name', t)}
              />

              <Text style={styles.label}>Exercise Prescription</Text>
              <TextInput
                style={styles.input}
                value={((liveExercise as { prescription?: string } | null)?.prescription ?? '') as string}
                onChangeText={(t) => updateLiveCurrentExercise('prescription', t)}
              />

              <Text style={styles.label}>Exercise Target</Text>
              <TextInput
                style={styles.input}
                value={((liveExercise as { target?: string } | null)?.target ?? '') as string}
                onChangeText={(t) => updateLiveCurrentExercise('target', t)}
              />

              <Text style={styles.label}>Exercise Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                value={((liveExercise as { notes?: string } | null)?.notes ?? '') as string}
                onChangeText={(t) => updateLiveCurrentExercise('notes', t)}
              />

              <View style={styles.rowWrap}>
                <Pressable style={styles.secondaryBtn} onPress={() => setLiveEditOpen(false)}>
                  <Text>Close</Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={clearLiveEdits}>
                  <Text>Clear Live Edits</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={saveLiveEdits}>
                  <Text style={styles.primaryBtnText}>Save Live Edits</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  screen: { flex: 1, padding: 16, gap: 10 },
  h1: { fontSize: 24, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: '600', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff'
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  displayCode: { fontSize: 18, fontWeight: '700' },
  phase: { fontSize: 22, fontWeight: '700', color: '#2563eb', textAlign: 'center' },
  timer: { fontSize: 64, fontWeight: '800', textAlign: 'center' },
  muted: { color: '#6b7280' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.4)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%'
  },
  modalBody: {
    padding: 16,
    gap: 8
  }
});
