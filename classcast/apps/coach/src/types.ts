export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export type Exercise = {
  id: string;
  name: string;
  reps?: number;
  durationSec?: number;
  notes?: string;
};

export type Block = {
  id: string;
  title: string;
  type?: string;
  exercises: Exercise[];
  restSec?: number;
  meta?: JsonObject;
};

export type Workout = {
  id?: string;
  title: string;
  blocks: Block[];
  created_at?: string;
  updated_at?: string;
};

export type SessionState = {
  phase?: string;
  currentBlockIndex?: number;
  currentExerciseIndex?: number;
  timerSec?: number;
  override?: {
    blocks?: Block[] | null;
  };
  [key: string]: unknown;
};
