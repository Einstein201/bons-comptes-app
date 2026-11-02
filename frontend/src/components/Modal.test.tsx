// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Page({ onClose = vi.fn() }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>Ouvrir</button>
            {open ? (
                <Modal onClose={() => { onClose(); setOpen(false); }}>
                    <div role="dialog" aria-label="Exemple">
                        <button>Premier</button>
                        <input aria-label="Champ" data-autofocus />
                        <button>Dernier</button>
                    </div>
                </Modal>
            ) : null}
        </>
    );
}

function openModal(onClose = vi.fn()) {
    render(<Page onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    fireEvent.click(opener);
    return { opener, onClose };
}

describe('fenêtre modale', () => {
    afterEach(cleanup);

    it('place le focus sur le champ marqué data-autofocus', () => {
        openModal();
        expect(document.activeElement).toBe(screen.getByLabelText('Champ'));
    });

    it('rend le reste de la page inerte pendant l’ouverture', () => {
        const { opener } = openModal();
        const background = opener.closest('body > *')!;
        expect(background.hasAttribute('inert')).toBe(true);
        expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();
    });

    it('garde le focus dans la fenêtre avec Tab et Maj+Tab', () => {
        openModal();
        const first = screen.getByRole('button', { name: 'Premier' });
        const last = screen.getByRole('button', { name: 'Dernier' });

        last.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(first);

        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);
    });

    it('se ferme avec Échap, retire inert et rend le focus au bouton d’origine', () => {
        const { opener, onClose } = openModal();
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(opener.closest('[inert]')).toBeNull();
        expect(document.activeElement).toBe(opener);
    });

    it('ne se ferme pas avec Échap quand la fermeture est bloquée', () => {
        const onClose = vi.fn();
        render(
            <Modal onClose={onClose} closeDisabled>
                <div role="dialog" aria-label="Exemple"><button>OK</button></div>
            </Modal>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});