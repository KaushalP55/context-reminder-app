"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setError(error.message);
        } else if (data.user) {
          setMessage("Check your email for a confirmation link!");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError(error.message);
        } else if (data.session) {
          router.push("/");
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const pageStyle: React.CSSProperties = {
    maxWidth: 400,
    margin: "100px auto",
    padding: 20,
    fontFamily: "system-ui",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 24,
    backgroundColor: "#fff",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 16,
    marginBottom: 12,
    boxSizing: "border-box",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.6,
    cursor: "not-allowed",
  };

  const linkStyle: React.CSSProperties = {
    color: "#2563eb",
    cursor: "pointer",
    textDecoration: "underline",
  };

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: 24, textAlign: "center" }}>
          {isSignUp ? "Sign Up" : "Sign In"}
        </h1>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
            minLength={6}
          />

          {error && (
            <div
              style={{
                padding: 12,
                marginBottom: 12,
                borderRadius: 8,
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                padding: 12,
                marginBottom: 12,
                borderRadius: 8,
                backgroundColor: "#f0fdf4",
                border: "1px solid #86efac",
                color: "#166534",
                fontSize: 14,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            style={loading ? disabledButtonStyle : buttonStyle}
            disabled={loading}
          >
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 14 }}>
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <span style={linkStyle} onClick={() => setIsSignUp(false)}>
                Sign In
              </span>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <span style={linkStyle} onClick={() => setIsSignUp(true)}>
                Sign Up
              </span>
            </>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <a href="/" style={{ color: "#666", fontSize: 14 }}>
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}