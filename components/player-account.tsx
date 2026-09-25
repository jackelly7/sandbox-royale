'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { authClient, accountRequest } from '../lib/auth/client';
import {
  cleanPreferences,
  readPreferences,
  type Preferences,
} from '../lib/game/preferences';

type Stats = { rounds: number; wins: number; kills: number; deaths: number };
type Profile = Stats & {
  id: string;
  name: string;
  preferences: Preferences | null;
};
export function usePlayerAccount(
  preferences: Preferences,
  apply: (p: Preferences) => void,
  ready: boolean,
) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const userId = user?.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [sync, setSync] = useState('');
  const [retry, setRetry] = useState(0);
  const applySetup = useEffectEvent(apply);
  const saved = useRef('');
  const owner = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    owner.current = null;
    saved.current = '';
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setProfile(null);
        setError('');
        setSync(userId ? 'Loading your setup…' : '');
      }
    });
    if (!userId) return;
    void accountRequest<Profile>('')
      .then(async (data: Profile) => {
        if (cancelled) return;
        if (data.id !== userId)
          throw new Error('Your account changed. Reload your account.');
        const p = cleanPreferences(data.preferences ?? readPreferences());
        // A first sign-in imports this device's existing setup once.
        if (!data.preferences) await accountRequest('', p, data.id);
        if (cancelled) return;
        saved.current = JSON.stringify(p);
        owner.current = data.id;
        applySetup(p);
        setProfile(data);
        setSync('Setup saved to your account');
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setSync('Setup could not load');
        }
      });
    return () => {
      cancelled = true;
      owner.current = null;
    };
  }, [userId, ready, retry]);
  useEffect(() => {
    if (!userId || !profile || owner.current !== userId) return;
    const value = JSON.stringify(preferences);
    if (value === saved.current) return;
    const id = userId;
    const timer = setTimeout(() => {
      setSync('Saving setup…');
      queue.current = queue.current.then(async () => {
        if (owner.current !== id) return;
        try {
          await accountRequest('', preferences, id);
          if (owner.current !== id) return;
          saved.current = value;
          setSync('Setup saved to your account');
          setError('');
        } catch (e) {
          if (owner.current === id) {
            setSync('Setup saved on this device only');
            setError(e instanceof Error ? e.message : 'Sync failed.');
          }
        }
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [preferences, userId, profile]);
  const refresh = async () => {
    try {
      const data = await accountRequest<Profile>('');
      if (owner.current === data.id) setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh stats.');
    }
  };
  const retrySync = async () => {
    if (!userId || owner.current !== userId) {
      setRetry((n) => n + 1);
      return;
    }
    try {
      await accountRequest('', preferences, userId);
      if (owner.current !== userId) return;
      saved.current = JSON.stringify(preferences);
      setSync('Setup saved to your account');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sync settings.');
    }
  };
  return { user, profile, isPending, error, sync, retry: retrySync, refresh };
}
export function PlayerAccount({
  account,
  inRoom,
}: {
  account: ReturnType<typeof usePlayerAccount>;
  inRoom: boolean;
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('token')
        ? 'reset'
        : 'signin',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [leaders, setLeaders] = useState<(Stats & { name: string })[] | null>(
    null,
  );
  const [leaderError, setLeaderError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    fetch('/api/account/leaderboard')
      .then(async (r) => {
        const data = (await r.json()) as {
          error?: string;
          leaderboard: (Stats & { name: string })[];
        };
        if (!r.ok) throw new Error(data.error || 'Leaderboard unavailable.');
        if (active) {
          setLeaders(data.leaderboard);
          setLeaderError('');
        }
      })
      .catch((e) => {
        if (active) setLeaderError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFailure('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const field = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value : '';
    };
    const email = field('email');
    const password = field('password');
    try {
      let result;
      if (mode === 'signup')
        result = await authClient.signUp.email({
          email,
          password,
          name: field('name').trim(),
        });
      else if (mode === 'forgot')
        result = await authClient.requestPasswordReset({
          email,
          redirectTo: location.origin + '/?account=reset',
        });
      else if (mode === 'reset')
        result = await authClient.resetPassword({
          newPassword: password,
          token: new URLSearchParams(location.search).get('token') || '',
        });
      else result = await authClient.signIn.email({ email, password });
      if (result.error)
        throw new Error(result.error.message || 'Sign-in failed.');
      if (mode === 'forgot')
        setMessage(
          'If this email has an account, a password reset link is on its way.',
        );
      if (mode === 'reset') {
        history.replaceState(null, '', '/');
        setMode('signin');
        setMessage('Password updated. You can sign in now.');
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="account-content">
      {account.isPending ? (
        <p>Checking sign-in…</p>
      ) : account.user ? (
        <>
          <div className="account-heading">
            <strong>{account.user.name}</strong>
            <button
              disabled={busy || inRoom}
              onClick={async () => {
                setBusy(true);
                setFailure('');
                try {
                  const result = await authClient.signOut();
                  if (result.error) throw new Error(result.error.message);
                } catch (e) {
                  setFailure(
                    e instanceof Error ? e.message : 'Sign-out failed.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sign out
            </button>
          </div>
          <p className="account-note">{account.sync}</p>
          {account.profile && (
            <div className="account-stats">
              {(['rounds', 'wins', 'kills', 'deaths'] as const).map((key) => (
                <div key={key}>
                  <strong>{account.profile![key]}</strong>
                  <span>{key}</span>
                </div>
              ))}
            </div>
          )}
          {account.error && (
            <p role="alert">
              {account.error}{' '}
              <button onClick={account.retry}>Retry sync</button>
            </p>
          )}
          <button
            onClick={() => {
              void account.refresh();
              setRefresh((n) => n + 1);
            }}
          >
            Refresh stats
          </button>
        </>
      ) : inRoom ? (
        <p>
          Leave your room to sign in. The next room you join will count toward
          your account.
        </p>
      ) : (
        <>
          <p>
            Sign in to keep your online stats and sync your controls, crosshair,
            audio, weapon slots, and Team Deathmatch loadout across devices.
          </p>
          <form className="account-form" onSubmit={submit}>
            {mode === 'signup' && (
              <label>
                Player name
                <input
                  name="name"
                  required
                  minLength={1}
                  maxLength={18}
                  pattern="[\p{L}\p{N} _.\-]+"
                  autoComplete="username"
                />
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== 'forgot' && (
              <label>
                {mode === 'reset' ? 'New password' : 'Password'}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                />
              </label>
            )}
            <button type="submit" disabled={busy}>
              {busy
                ? 'Please wait…'
                : {
                    signin: 'Sign in',
                    signup: 'Create account',
                    forgot: 'Send reset link',
                    reset: 'Save new password',
                  }[mode]}
            </button>
          </form>
          <div className="account-links">
            <button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setFailure('');
                setMessage('');
              }}
            >
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'Create an account'}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'forgot' ? 'signin' : 'forgot');
                setFailure('');
                setMessage('');
              }}
            >
              {mode === 'forgot' ? 'Back to sign in' : 'Forgot password?'}
            </button>
          </div>
        </>
      )}
      {inRoom && account.user && (
        <p className="account-note">Leave your room before signing out.</p>
      )}
      {failure && <p role="alert">{failure}</p>}
      {message && <output>{message}</output>}
      <h3>LEADERBOARD</h3>
      <p className="account-note">
        Completed online rounds, including rooms with bots. Ranked by wins, then
        kills. Guests, spectators, practice, and rounds you leave early do not
        count. Your player name is public.
      </p>
      {leaderError ? (
        <p role="alert">
          {leaderError}{' '}
          <button onClick={() => setRefresh((n) => n + 1)}>Retry</button>
        </p>
      ) : !leaders ? (
        <p>Loading leaderboard…</p>
      ) : !leaders.length ? (
        <p>No completed rounds yet. Be the first on the board.</p>
      ) : (
        <div className="leaderboard-scroll">
          <table className="leaderboard">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Wins</th>
                <th>Kills</th>
                <th>Rounds</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{p.wins}</td>
                  <td>{p.kills}</td>
                  <td>{p.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
