'use client';

import { useRef, useState, type FormEvent } from 'react';
import { sendInvitation } from '../services/invitations';
import { Button } from './Button';
import { Field } from './Field';
import { describeInvitationError } from './invitationErrors';
import styles from './InviteMemberForm.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteMemberFormProps = {
  walletId: string;
  onInvited: () => Promise<void> | void;
};

export function InviteMemberForm({ walletId, onInvited }: InviteMemberFormProps) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const value = email.trim();
    setError(undefined);
    setSuccess(undefined);
    if (!EMAIL_PATTERN.test(value)) {
      setFieldError('Saisissez une adresse email valide.');
      return;
    }
    setFieldError(undefined);

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await sendInvitation(walletId, value);
    } catch (caught) {
      setError(describeInvitationError(caught, 'send'));
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    setEmail('');
    setSuccess(`Une invitation a été envoyée à ${value}.`);
    try {
      await onInvited();
    } catch {
      setError('L’invitation est envoyée, mais la liste des membres n’a pas pu être actualisée.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h3>Inviter un utilisateur</h3>
      <Field label="Adresse email" hint="utilisateur déjà inscrit" error={fieldError}>
        {(control) => (
          <input
            {...control}
            type="email"
            name="email"
            autoComplete="off"
            value={email}
            disabled={submitting}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Envoi…' : 'Envoyer l’invitation'}
        </Button>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {success ? <p className={styles.success} role="status">{success}</p> : null}
    </form>
  );
}
