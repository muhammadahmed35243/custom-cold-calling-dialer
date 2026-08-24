import { supabaseAuth } from "@/lib/supabase";

// Same pattern as the inline authedFetch in app/admin/page.tsx's
// AgentManagement — extracted here since every voice-agent tab needs it.
export async function authedFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session) throw new Error("Session expired, please login again");
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
}
