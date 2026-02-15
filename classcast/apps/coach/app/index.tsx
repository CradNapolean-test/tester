import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function CoachScreen() {
  const [workoutName, setWorkoutName] = useState('Sample Circuit');
  const [blocksJson, setBlocksJson] = useState(
    JSON.stringify(
      [
        { type: 'warmup', title: 'Easy Row', durationSec: 300 },
        { type: 'work', title: 'Intervals 30/30', rounds: 8 }
      ],
      null,
      2
    )
  );
  const [saving, setSaving] = useState(false);

  const saveWorkout = async () => {
    if (!supabase) {
      Alert.alert('Missing Supabase env', 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
      return;
    }

    try {
      setSaving(true);
      const blocks = JSON.parse(blocksJson);
      const { error } = await supabase.from('workouts').insert({ name: workoutName, blocks });
      if (error) throw error;
      Alert.alert('Saved', 'Workout persisted to workouts.blocks (JSONB).');
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Create Workout</Text>
        <TextInput style={styles.input} value={workoutName} onChangeText={setWorkoutName} placeholder="Workout name" />

        <Text style={styles.label}>Blocks (JSON)</Text>
        <TextInput
          style={[styles.input, styles.code]}
          value={blocksJson}
          onChangeText={setBlocksJson}
          multiline
          numberOfLines={8}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={saveWorkout} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save Workout to Supabase'}</Text>
        </Pressable>

        <View style={styles.noteBox}>
          <Text style={styles.note}>This MVP stores workout blocks in a JSONB column (`workouts.blocks`).</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff'
  },
  code: { minHeight: 180, textAlignVertical: 'top', fontFamily: 'Courier' },
  button: { backgroundColor: '#111827', padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  noteBox: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 12 },
  note: { color: '#374151' }
});
