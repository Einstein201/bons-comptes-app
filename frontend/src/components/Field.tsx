'use client';

import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

export type FieldControlProps = {
  id: string;
  className: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
};

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
};

// Étiquette, contrôle et message d'erreur reliés pour les lecteurs d'écran :
// le contrôle est rendu par l'appelant à partir des attributs fournis.
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {hint ? <span className={styles.hint}> ({hint})</span> : null}
      </label>
      {children({
        id,
        className: styles.control,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
