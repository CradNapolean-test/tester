import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSupabaseClient } from '../../../lib/supabase';

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function ResolveJoinPage({ params }: PageProps) {
  const { code } = await params;
  const displayCode = code.trim().toUpperCase();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('id,display_code,created_at')
    .eq('display_code', displayCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.id) {
    redirect(`/s/${data.id}`);
  }

  return (
    <main>
      <section className="card">
        <h1>Display Code Not Found</h1>
        <p>We could not find a session for code <strong>{displayCode}</strong>.</p>
        <p style={{ color: '#fca5a5' }}>{error?.message}</p>
        <Link href="/">Back to Join</Link>
      </section>
    </main>
  );
}
