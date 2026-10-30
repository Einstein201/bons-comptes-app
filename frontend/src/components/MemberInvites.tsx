'use client';

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button } from './Button';
import { Field } from './Field';
import { CloseIcon } from './icons';
import styles from './MemberInvites.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MemberInvitesProps = {
  emails: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
};

export function MemberInvites({ emails, onChange, disabled }: MemberInvitesProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  function addEmail() {
    const email = draft.trim();

    if (email === '') {
      setError('Saisissez une adresse email.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      setError("Cette adresse email n'est pas valide.");
      return;
    }

    if (emails.some((existing) => existing.toLowerCase() === email.toLowerCase())) {
      setError('Cette adresse a déjà été ajoutée.');
      return;
    }

    onChange([...emails, email]);
    setDraft('');
    setError(undefined);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
    setError(undefined);
  }

  // Entrée ajoute l'adresse au lieu de valider tout le formulaire, sauf pendant l'envoi :
  // le champ n'est alors qu'en lecture seule et reçoit encore les touches.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (!disabled) {
        addEmail();
      }
    }
  }

  function removeEmail(email: string) {
    onChange(emails.filter((existing) => existing !== email));
    inputRef.current?.focus();
  }

  return (
    <div>
      <Field label="Adresse email" error={error}>
        {(control) => (
          <div className={styles.row}>
            <input
              {...control}
              ref={inputRef}
              type="email"
              name="invitee"
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="prenom@exemple.fr"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              readOnly={disabled}
            />
            <Button variant="secondary" size="lg" onClick={addEmail} disabled={disabled}>
              Ajouter
            </Button>
          </div>
        )}
      </Field>
      {emails.length > 0 ? (
        <ul className={styles.chips} aria-label="Membres à inviter">
          {emails.map((email) => (
            <li key={email} className={styles.chip}>
              <span className={styles.chipLabel}>{email}</span>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Retirer ${email}`}
                onClick={() => removeEmail(email)}
                disabled={disabled}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
