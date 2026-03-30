import { createClient } from '@/lib/supabase/server';
import { ensureProfileFullName } from '@/lib/ensureProfileFullName';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const service = createServiceRoleClient();
      await ensureProfileFullName(service, user);
    }
  }

  return NextResponse.redirect(new URL('/feed', requestUrl.origin));
}
