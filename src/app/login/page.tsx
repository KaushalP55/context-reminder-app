"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

export default function LoginPage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", padding: 16, fontFamily: "system-ui" }}>
      {session ? (
        <>
          <h1>You’re signed in</h1>
          <p>Go back to the home page.</p>
        </>
      ) : (
        <>
          <h1>Sign in</h1>
          <p>Use your email to get a sign-in link.</p>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={[]}
            view="magic_link"
          />
        </>
      )}
    </main>
  );
}
