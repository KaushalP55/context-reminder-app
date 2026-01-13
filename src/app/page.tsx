"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Trigger = { type: string; value: string };

type ReminderRow = {
  id: string;
  raw_text: string;
  title: string;
  status: string;
  created_at: string;
  parsed: { title?: string; triggers?: Trigger[] } | any;
};

type EventRow = {
  id: string;
  event_type: string;
  payload: any;
  created_at: string;
};

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}

function triggerMatches(trigger: Trigger, eventType: string, eventValue: string) {
  const tType = norm(trigger.type);
  const tVal = norm(trigger.value);
  const eType = norm(eventType);
  const eVal = norm(eventValue);

  if (tType !== eType) return false;
  if (!tVal || !eVal) return false;

  return tVal === eVal || tVal.includes(eVal) || eVal.includes(tVal);
}

export default function Home() {
  const [session, setSession] = useState<any>(null);

  const [text, setText] = useState("");
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(false);

  // IMPORTANT: keep these lowercase to match option values
  const [customType, setCustomType] = useState("location");
  const [customValue, setCustomValue] = useState("");
  const [triggered, setTriggered] = useState<ReminderRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  // NEW: tiny UX feedback message (e.g., saved ✅)
  const [notice, setNotice] = useState<string>("");

  const userId = session?.user?.id;

  // ---------- Shared styles (so everything matches) ----------
  const pageWrap: React.CSSProperties = {
    maxWidth: 860,
    margin: "60px auto",
    padding: 16,
    fontFamily: "system-ui",
  };

  const card: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    backgroundColor: "#ffffff",
    color: "#000000",
    outline: "none",
  };

  const smallInput: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    backgroundColor: "#ffffff",
    color: "#000000",
    outline: "none",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  };

  const neutralBtn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#000000",
    border: "1px solid #ccc",
    fontWeight: 700,
    cursor: "pointer",
  };

  const disabledBtn: React.CSSProperties = {
    opacity: 0.55,
    cursor: "not-allowed",
  };

  // ---------------------------------------------------------

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadReminders(uid: string) {
    const { data, error } = await supabase
      .from("reminders")
      .select("id, raw_text, title, status, created_at, parsed")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }
    setReminders((data as any) ?? []);
  }

  async function loadEvents(uid: string) {
    const { data, error } = await supabase
      .from("events")
      .select("id, event_type, payload, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      alert(error.message);
      return;
    }
    setEvents((data as any) ?? []);
  }

  useEffect(() => {
    if (!userId) return;
    loadReminders(userId);
    loadEvents(userId);
  }, [userId]);

  async function createReminder() {
    if (!userId) return;
    if (!text.trim()) return;

    setLoading(true);

    let ai = { title: text.trim().slice(0, 40), triggers: [] as Trigger[] };

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) ai = await res.json();
    } catch {
      // keep fallback if AI fails
    }

    const { error } = await supabase.from("reminders").insert({
      user_id: userId,
      raw_text: text.trim(),
      title: ai.title || text.trim().slice(0, 40),
      parsed: ai,
      status: "active",
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setText("");
    await loadReminders(userId);

    // NEW: success feedback
    setNotice("Reminder saved ✅");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function pushEvent() {
    if (!userId) return;
    if (!customValue.trim()) return;

    const event_type = customType; // location/person/activity/time_window
    const value = customValue.trim();

    const { error } = await supabase.from("events").insert({
      user_id: userId,
      event_type,
      payload: { value },
    });

    if (error) {
      alert(error.message);
      return;
    }

    await loadEvents(userId);

    const hits = reminders.filter((r) => {
      const triggers: Trigger[] = r?.parsed?.triggers ?? [];
      return triggers.some((tr) => triggerMatches(tr, event_type, value));
    });

    setTriggered(hits);
    setCustomValue("");

    // NEW: quick feedback
    if (hits.length > 0) {
      setNotice(`${hits.length} reminder${hits.length === 1 ? "" : "s"} triggered ⚡`);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  const latestEventSummary = useMemo(() => {
    if (events.length === 0) return "No events yet.";
    const e = events[0];
    return `Latest: ${e.event_type} = ${e?.payload?.value ?? ""}`;
  }, [events]);

  const triggeredIds = useMemo(() => new Set(triggered.map((r) => r.id)), [triggered]);

  return (
    <main style={pageWrap}>
      <h1>Context Reminders</h1>

      {!session ? (
        <>
          <p>This app will remind you based on context, not just time.</p>
          <Link href="/login">Sign in</Link>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>Signed in as: {session.user.email}</div>

            {/* Sign out as a matching button */}
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ ...neutralBtn, padding: "6px 12px" }}
            >
              Sign out
            </button>

            {/* NEW: notice chip */}
            {notice ? (
              <div
                style={{
                  marginLeft: "auto",
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: "#ffffff",
                  color: "#000000",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {notice}
              </div>
            ) : (
              <div style={{ marginLeft: "auto" }} />
            )}
          </div>

          {/* CREATE REMINDER */}
          <div style={{ ...card, marginTop: 0 }}>
            <h2 style={{ marginTop: 0 }}>Create a reminder</h2>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Type a reminder..."
              style={inputStyle}
            />

            <div style={{ marginTop: 10 }}>
              {/* Primary button now stands out */}
              <button
                disabled={loading || !text.trim()}
                onClick={createReminder}
                style={{
                  ...primaryBtn,
                  ...(loading || !text.trim() ? disabledBtn : null),
                }}
              >
                {loading ? "Saving..." : "Save reminder"}
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
              The AI parses your text into triggers stored in <code>parsed.triggers</code>.
            </p>
          </div>

          {/* CONTEXT SIMULATOR */}
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Context simulator</h2>
            <p style={{ marginTop: 0, color: "#555" }}>{latestEventSummary}</p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                style={{
                  ...smallInput,
                  minWidth: 160,
                  fontWeight: 700,
                }}
              >
                <option value="location">Location</option>
                <option value="person">Person</option>
                <option value="activity">Activity</option>
                <option value="time_window">Time Window</option>
              </select>

              <input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder='Type the value (e.g. "grocery store")'
                style={{
                  ...smallInput,
                  flex: 1,
                  minWidth: 260,
                }}
              />

              {/* Primary trigger button */}
              <button
                onClick={pushEvent}
                disabled={!customValue.trim()}
                style={{
                  ...primaryBtn,
                  ...(customValue.trim() ? null : disabledBtn),
                }}
              >
                Trigger context
              </button>

              {/* Neutral clear button */}
              <button
                onClick={() => {
                  setCustomValue("");
                  setTriggered([]);
                }}
                disabled={!customValue.trim() && triggered.length === 0}
                style={{
                  ...neutralBtn,
                  ...(!customValue.trim() && triggered.length === 0 ? disabledBtn : null),
                }}
              >
                Clear
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 6 }}>Triggered right now</h3>
              {triggered.length === 0 ? (
                <p style={{ marginTop: 0, color: "#666" }}>No reminders triggered by the last event.</p>
              ) : (
                triggered.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: 10,
                      border: "1px solid #eee",
                      borderRadius: 10,
                      marginBottom: 8,
                      background: "#ffffff",
                      color: "#000000",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{r.title}</div>
                    <div style={{ color: "#222" }}>{r.raw_text}</div>
                    <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
                      Triggers:{" "}
                      {(r.parsed?.triggers ?? []).map((t: Trigger) => `${t.type}:${t.value}`).join(", ") ||
                        "(none)"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* REMINDER LIST */}
          <div style={{ marginTop: 18 }}>
            <h2>Your reminders</h2>

            {reminders.length === 0 ? (
              <p>No reminders yet.</p>
            ) : (
              reminders.map((r) => {
                const isTriggered = triggeredIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #eee",
                      borderLeft: isTriggered ? "4px solid #2563eb" : "4px solid transparent",
                      paddingLeft: 12,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {isTriggered ? "⚡ " : ""}
                      {r.title}
                    </div>
                    <div style={{ color: "#555" }}>{r.raw_text}</div>
                    <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                      Triggers:{" "}
                      {(r.parsed?.triggers ?? []).map((t: Trigger) => `${t.type}:${t.value}`).join(", ") ||
                        "(none)"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </main>
  );
}