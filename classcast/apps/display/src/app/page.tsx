'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase().slice(0, 4);
    if (normalized.length !== 4) return;
    router.push(`/join/${normalized}`);
  };

  return (
    <main>
      <section className="card">
        <h1>Join ClassCast Display</h1>
        <p>Enter the 4-character display code from coach.</p>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="ABCD"
            style={{
              padding: '0.8rem 1rem',
              borderRadius: 10,
              border: '1px solid #374151',
              background: '#0f172a',
              color: '#fff',
              letterSpacing: '0.2em',
              textTransform: 'uppercase'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.8rem 1rem',
              borderRadius: 10,
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: 'white',
              fontWeight: 700
            }}
          >
            Join
          </button>
        </form>
      </section>
    </main>
  );
}
