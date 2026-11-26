"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const IDLE_LIMIT_MS = 5 * 60 * 1000;
const CHANNEL_NAME = "edunexa-auth-activity";

export default function IdleSessionGuard() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: BroadcastChannel | null = null;
    let signedOut = false;
    let active = false;
    let mounted = true;

    const redirectToLogin = () => {
      router.replace("/login?message=Tu%20sesión%20se%20cerró%20por%205%20minutos%20de%20inactividad.%20Ingresá%20nuevamente.");
      router.refresh();
    };
    const signOutForInactivity = async () => {
      if (signedOut) return;
      signedOut = true;
      if (timer) clearTimeout(timer);
      channel?.postMessage({ type: "signed-out" });
      try { await supabase.auth.signOut({ scope: "local" }); }
      finally { redirectToLogin(); }
    };
    const armTimer = () => {
      if (!active || signedOut) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void signOutForInactivity(); }, IDLE_LIMIT_MS);
    };
    const announceActivity = () => {
      if (!active || signedOut) return;
      armTimer();
      channel?.postMessage({ type: "activity", at: Date.now() });
    };
    const onRemoteMessage = (event: MessageEvent) => {
      if (event.data?.type === "activity" && active && !signedOut) armTimer();
      if (event.data?.type === "signed-out" && !signedOut) {
        signedOut = true;
        active = false;
        if (timer) clearTimeout(timer);
        redirectToLogin();
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel", "click"];
    const onVisibility = () => {
      if (document.visibilityState === "visible") announceActivity();
    };
    const activate = () => {
      if (!mounted || active || signedOut) return;
      active = true;
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.addEventListener("message", onRemoteMessage);
      } catch { channel = null; }
      events.forEach((name) => window.addEventListener(name, announceActivity, { passive: true }));
      document.addEventListener("visibilitychange", onVisibility);
      armTimer();
    };
    const onAuthState = (event: string) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") activate();
      if (event === "SIGNED_OUT" && !signedOut) {
        signedOut = true;
        active = false;
        if (timer) clearTimeout(timer);
        channel?.postMessage({ type: "signed-out" });
        redirectToLogin();
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => onAuthState(event));
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!error && data.session) activate();
    });

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, announceActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.removeEventListener("message", onRemoteMessage);
      channel?.close();
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
