import { createClient } from '@/lib/supabase/server';
import { ensureProfileFullName } from '@/lib/ensureProfileFullName';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { safeInternalPath } from '@/lib/safeNextPath';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextRaw = requestUrl.searchParams.get('next');
  const nextPath = safeInternalPath(nextRaw);

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

  const dest = nextPath ?? '/feed';
  return NextResponse.redirect(new URL(dest, requestUrl.origin));
}
