'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
    onClose: () => void;
    // Empêche la fermeture (Échap) pendant un envoi.
    closeDisabled?: boolean;
    children: ReactNode;
};

// L'élément enfant porte role="dialog". Le reste de la page devient inerte pendant
// l'ouverture, le focus reste dans la fenêtre puis revient là où il était à la fermeture.
export function Modal({ onClose, closeDisabled = false, children }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    // Les refs évitent de relancer l'effet (et de redéplacer le focus) à chaque rendu.
    const onCloseRef = useRef(onClose);
    const closeDisabledRef = useRef(closeDisabled);

    useEffect(() => {
        onCloseRef.current = onClose;
        closeDisabledRef.current = closeDisabled;
    });

    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const previousFocus = document.activeElement as HTMLElement | null;
        const background = Array.from(document.body.children).filter(
            (element) => element !== overlay && !element.hasAttribute('inert'),
        );
        background.forEach((element) => element.setAttribute('inert', ''));

        const focusables = () => Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE));
        const initial = overlay.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0];
        initial?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                if (!closeDisabledRef.current) onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const items = focusables();
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && (active === first || !overlay!.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !overlay!.contains(active))) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            background.forEach((element) => element.removeAttribute('inert'));
            previousFocus?.focus();
        };
    }, []);

    return createPortal(
        <div ref={overlayRef} className={styles.overlay}>
            {children}
        </div>,
        document.body,
    );
}