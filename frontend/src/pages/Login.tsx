import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import styles from "./Login.module.css";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "That username or password doesn't match. Try again."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong. Try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit}>
      <div className={styles.mark}>TT</div>
      <h1 className={styles.title}>Sign in</h1>

      <div className={styles.fieldGroup}>
        <input
          className={`${styles.field} ${error ? styles.errored : ""}`}
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className={`${styles.field} ${error ? styles.errored : ""}`}
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <div className={styles.errorRow}>
            <span className={styles.errorGlyph}>!</span>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}
      </div>

      <button type="submit" className={styles.submit} disabled={submitting || !username || !password}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
