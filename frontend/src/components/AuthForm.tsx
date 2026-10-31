'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../services/api';
import { register, type RegisterInput } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';
import { Field } from './Field';
import styles from './AuthForm.module.css';

type AuthFormProps = { mode: 'login' | 'register' };

function describeError(error: unknown, mode: AuthFormProps['mode']): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return mode === 'register'
        ? 'Vérifiez le nom, l’adresse email et les règles de longueur du mot de passe.'
        : 'Vérifiez votre adresse email et votre mot de passe.';
    }
    if (error.status === 401) {
      return 'Adresse email ou mot de passe incorrect.';
    }
    if (error.status === 409) {
      return 'Cette adresse email est déjà utilisée.';
    }
    if (error.status === 429) {
      return 'Trop de tentatives. Réessayez plus tard.';
    }
    return 'Le serveur n’a pas pu traiter votre demande. Réessayez.';
  }
  if (error instanceof TypeError) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.';
  }
  return mode === 'register'
    ? 'Le compte a peut-être été créé, mais une erreur empêche de terminer. Essayez de vous connecter.'
    : 'Une erreur inattendue est survenue. Réessayez.';
}

function safeNextPath(): string {
  const requested = new URLSearchParams(window.location.search).get('next');
  if (!requested?.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return '/';
  }
  const destination = new URL(requested, window.location.origin);
  return destination.origin === window.location.origin
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : '/';
}

export function AuthForm({ mode }: AuthFormProps) {
  const isRegister = mode === 'register';
  const router = useRouter();
  const { signIn, status } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [logoutFailure, setLogoutFailure] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [router, status]);

  useEffect(() => {
    if (!isRegister && new URLSearchParams(window.location.search).get('registered') === '1') {
      setRegistered(true);
    }
    if (!isRegister && new URLSearchParams(window.location.search).get('logout') === 'failed') {
      setLogoutFailure(true);
    }
  }, [isRegister]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFailure(undefined);
    setSubmitting(true);

    try {
      if (isRegister) {
        const input: RegisterInput = { name: name.trim(), email: email.trim(), password };
        await register(input);
        setRegistered(true);
        router.replace('/login?registered=1');
      } else {
        await signIn({ email: email.trim(), password });
        router.replace(safeNextPath());
        router.refresh();
      }
    } catch (error) {
      setFailure(describeError(error, mode));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        {isRegister ? <p className={styles.eyebrow}>Créer un compte</p> : null}
        <h1>{isRegister ? 'Inscription' : 'Connexion'}</h1>
        <p>
          {isRegister
            ? 'Rejoignez vos proches pour partager les dépenses simplement.'
            : 'Connectez-vous pour retrouver vos porte-monnaies.'}
        </p>
      </header>

      {registered ? (
        <p className={styles.success} role="status">
          Votre compte a été créé. Vous pouvez maintenant vous connecter.
        </p>
      ) : null}
      {logoutFailure ? (
        <p className={styles.alert} role="status">
          La session locale a été fermée, mais le serveur n’a pas confirmé la déconnexion.
        </p>
      ) : null}
      {failure ? <p className={styles.alert} role="alert">{failure}</p> : null}

      <form onSubmit={handleSubmit} aria-busy={submitting}>
        <div className={styles.fields}>
          {isRegister ? (
            <Field label="Nom" hint="obligatoire">
              {(control) => (
                <input
                  {...control}
                  type="text"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={100}
                  required
                  disabled={submitting}
                />
              )}
            </Field>
          ) : null}
          <Field label="Adresse email" hint="obligatoire">
            {(control) => (
              <input
                {...control}
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={submitting}
              />
            )}
          </Field>
          <Field label="Mot de passe" hint="obligatoire">
            {(control) => (
              <input
                {...control}
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 8 : undefined}
                maxLength={72}
                required
                disabled={submitting}
              />
            )}
          </Field>
        </div>
        <Button type="submit" className={styles.submit} disabled={submitting}>
          {submitting
            ? 'Veuillez patienter…'
            : isRegister ? 'Créer mon compte' : 'Se connecter'}
        </Button>
      </form>

      <p className={styles.switch}>
        {isRegister ? 'Vous avez déjà un compte ? ' : 'Pas encore de compte ? '}
        <Link href={isRegister ? '/login' : '/register'}>
          {isRegister ? 'Se connecter' : 'Créer un compte'}
        </Link>
      </p>
    </section>
  );
}
