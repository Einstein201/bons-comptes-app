'use client';

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ApiError } from '../services/api';
import { createWallet } from '../services/wallets';
import { Button, ButtonLink } from './Button';
import { Field } from './Field';
import { MemberInvites } from './MemberInvites';
import styles from './WalletForm.module.css';

const TITLE_MAX_LENGTH = 100;

type CreatedWallet = {
  title: string;
  pendingInvitations: number;
};

type SubmitFailure = {
  message: string;
  titleError?: string;
};

function validateTitle(title: string): string | undefined {
  const trimmed = title.trim();

  if (trimmed === '') {
    return 'Le nom est obligatoire';
  }

  if (trimmed.length > TITLE_MAX_LENGTH) {
    return `Le nom ne doit pas dépasser ${TITLE_MAX_LENGTH} caractères`;
  }

  return undefined;
}

function describeFailure(error: unknown): SubmitFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { message: 'Vous devez être connecté pour créer un porte-monnaie.' };
    }

    if (error.status === 400) {
      const titleRejected = error.messages.some((message) =>
        message.startsWith('title '),
      );

      return {
        message: 'Certaines informations sont invalides. Vérifiez le formulaire.',
        titleError: titleRejected
          ? `Le nom est invalide (${TITLE_MAX_LENGTH} caractères maximum).`
          : undefined,
      };
    }

    return { message: 'Le serveur a rencontré une erreur. Réessayez dans un instant.' };
  }

  // fetch rejette avec une TypeError quand le serveur est injoignable (ou bloqué par CORS).
  if (error instanceof TypeError) {
    return {
      message:
        'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.',
    };
  }

  return { message: 'Une erreur inattendue est survenue. Réessayez dans un instant.' };
}

export function WalletForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [titleTouched, setTitleTouched] = useState(false);
  const [serverTitleError, setServerTitleError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [created, setCreated] = useState<CreatedWallet>();
  const [invitesKey, setInvitesKey] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const invitesTitleId = useId();

  const titleError =
    serverTitleError ?? (titleTouched ? validateTitle(title) : undefined);

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value);
    setServerTitleError(undefined);
    setCreated(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setTitleTouched(true);
    setFailure(undefined);
    setCreated(undefined);

    if (validateTitle(title)) {
      titleRef.current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const trimmedDescription = description.trim();
      const wallet = await createWallet({
        title: title.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });

      // POST /wallets n'accepte que title et description : les adresses saisies ne sont
      // pas encore envoyées. TODO : les transmettre quand l'API d'invitation existera.
      setCreated({
        title: wallet.title,
        pendingInvitations: invitedEmails.length,
      });
      setTitle('');
      setDescription('');
      setInvitedEmails([]);
      setTitleTouched(false);
      setInvitesKey((key) => key + 1);
    } catch (error) {
      if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
        console.error(error);
      }

      const result = describeFailure(error);
      setFailure(result.message);
      setServerTitleError(result.titleError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={styles.card}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={submitting}
    >
      <div className={styles.body}>
        <h2 className={styles.title}>
          Créer un nouveau <span className={styles.nowrap}>porte-monnaie</span>
        </h2>

        {created ? (
          <p className={styles.success} role="status">
            Le porte-monnaie «&nbsp;{created.title}&nbsp;» a été créé.
            {created.pendingInvitations > 0
              ? ' Les invitations ne sont pas encore prises en charge : vous pourrez inviter ces membres plus tard.'
              : null}
          </p>
        ) : null}
        {failure ? (
          <p className={styles.alert} role="alert">
            {failure}
          </p>
        ) : null}

        <div className={styles.fields}>
          <Field label="Nom du porte-monnaie" hint="obligatoire" error={titleError}>
            {(control) => (
              <input
                {...control}
                ref={titleRef}
                type="text"
                name="title"
                value={title}
                onChange={handleTitleChange}
                onBlur={() => setTitleTouched(true)}
                placeholder="Ex. Week-end à Bordeaux"
                maxLength={TITLE_MAX_LENGTH}
                autoComplete="off"
                aria-required="true"
                readOnly={submitting}
              />
            )}
          </Field>

          <Field label="Description" hint="optionnel">
            {(control) => (
              <textarea
                {...control}
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ajoutez quelques détails pour les membres du groupe..."
                readOnly={submitting}
              />
            )}
          </Field>
        </div>

        <hr className={styles.divider} />

        <section aria-labelledby={invitesTitleId}>
          <h3 id={invitesTitleId} className={styles.sectionTitle}>
            Inviter des membres
          </h3>
          <p className={styles.sectionHint}>
            Cette étape est optionnelle. Vous pourrez aussi inviter des membres plus
            tard.
          </p>
          <MemberInvites
            key={invitesKey}
            emails={invitedEmails}
            onChange={setInvitedEmails}
            disabled={submitting}
          />
        </section>
      </div>

      <div className={styles.footer}>
        <ButtonLink href="/" variant="ghost">
          Annuler
        </ButtonLink>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Création…' : 'Créer le porte-monnaie'}
        </Button>
      </div>
    </form>
  );
}
