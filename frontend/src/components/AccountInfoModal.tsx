'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '../services/api';
import { changePassword, type ChangePasswordInput } from '../services/auth';
import { Button } from './Button';
import { Field } from './Field';
import { Modal } from './Modal';
import styles from './AccountInfoModal.module.css';

type AccountInfoModalProps = {
  name: string;
  email: string;
  onClose: () => void;
  onNameChange: (name: string) => Promise<void>;
};

type View = 'summary' | 'name' | 'password';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.messages.length > 0) {
    return error.messages.join(' ');
  }
  if (error instanceof TypeError) {
    return 'Le service est momentanément indisponible. Réessayez.';
  }
  return 'Une erreur est survenue. Réessayez.';
}

export function AccountInfoModal({
  name,
  email,
  onClose,
  onNameChange,
}: AccountInfoModalProps) {
  const [view, setView] = useState<View>('summary');
  const [nameInput, setNameInput] = useState(name);
  const [passwords, setPasswords] = useState<ChangePasswordInput & { confirmation: string }>({
    currentPassword: '',
    newPassword: '',
    confirmation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    if (submitting) return;
    setPasswords({ currentPassword: '', newPassword: '', confirmation: '' });
    setStatusMessage(null);
    onClose();
  }

  async function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = nameInput.trim();
    if (!value) {
      setError('Le nom est obligatoire.');
      return;
    }
    if (value.length > 100) {
      setError('Le nom ne peut pas dépasser 100 caractères.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      await onNameChange(value);
      setNameInput(value);
      setView('summary');
      setStatusMessage('Nom mis à jour.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwords.currentPassword || !passwords.newPassword) {
      setError('Renseignez votre ancien et votre nouveau mot de passe.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmation) {
      setError('La confirmation du nouveau mot de passe est différente.');
      return;
    }
    if (passwords.newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    const input = {
      currentPassword: passwords.currentPassword,
      newPassword: passwords.newPassword,
    };
    setError(null);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      await changePassword(input);
      setPasswords({ currentPassword: '', newPassword: '', confirmation: '' });
      setView('summary');
      setStatusMessage('Mot de passe modifié.');
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiError && caught.status === 400) {
        setPasswords((current) => ({ ...current, currentPassword: '' }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={close} closeDisabled={submitting}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Mon compte</p>
            <h2 id="account-title">Informations du compte</h2>
          </div>
          <button type="button" className={styles.close} onClick={close} disabled={submitting} aria-label="Fermer">
            ×
          </button>
        </div>

        {view === 'summary' ? (
          <>
            <div className={styles.rows}>
              <div className={styles.row}>
                <div><span className={styles.label}>Nom</span><strong>{name}</strong></div>
                <Button variant="ghost" onClick={() => { setError(null); setStatusMessage(null); setView('name'); }}>Modifier</Button>
              </div>
              <div className={styles.row}>
                <div><span className={styles.label}>Email</span><strong>{email}</strong></div>
                <span className={styles.readOnly}>Lecture seule</span>
              </div>
              <div className={styles.row}>
                <div><span className={styles.label}>Mot de passe</span><strong aria-label="Mot de passe masqué">••••••••</strong></div>
                <Button variant="ghost" onClick={() => { setError(null); setStatusMessage(null); setView('password'); }}>Modifier</Button>
              </div>
            </div>
            {statusMessage ? <p className={styles.status} role="status">{statusMessage}</p> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <Button variant="secondary" onClick={close}>Fermer</Button>
          </>
        ) : view === 'name' ? (
          <form onSubmit={submitName} className={styles.form}>
            <Field label="Nom" error={error ?? undefined}>
              {(control) => <input {...control} data-autofocus value={nameInput} onChange={(event) => setNameInput(event.target.value)} maxLength={100} />}
            </Field>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => { setError(null); setView('summary'); }} disabled={submitting}>Annuler</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitPassword} className={styles.form}>
            <Field label="Ancien mot de passe">
              {(control) => <input {...control} data-autofocus type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} />}
            </Field>
            <Field label="Nouveau mot de passe">
              {(control) => <input {...control} type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} />}
            </Field>
            <Field label="Confirmation">
              {(control) => <input {...control} type="password" autoComplete="new-password" value={passwords.confirmation} onChange={(event) => setPasswords((current) => ({ ...current, confirmation: event.target.value }))} />}
            </Field>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => { setError(null); setView('summary'); }} disabled={submitting}>Annuler</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Modification…' : 'Modifier le mot de passe'}</Button>
            </div>
          </form>
        )}
      </section>
    </Modal>
  );
}
