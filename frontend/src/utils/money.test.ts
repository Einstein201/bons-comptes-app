import { describe, expect, it } from 'vitest';
import { formatCents, MAX_AMOUNT_CENTS, parseAmountToCents } from './money';

// Intl utilise des espaces insécables : on les remplace pour comparer facilement.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('parseAmountToCents', () => {
    it.each([
        ['12', 1200],
        ['12,5', 1250],
        ['12,50', 1250],
        ['12.50', 1250],
        ['0,01', 1],
        ['0,1', 10],
        ['45,99', 4599],
        ['19,99', 1999],
        // Valeurs qui donnent une erreur d'arrondi avec « montant * 100 » en JavaScript.
        ['4,35', 435],
        ['1,15', 115],
        ['0,29', 29],
        ['1,00', 100],
        ['1 234,56', 123456],
        ['1\u202f234,56', 123456],
        ['  8,20 € ', 820],
        ['21474836,47', MAX_AMOUNT_CENTS],
    ])('convertit « %s » en %i centimes', (input, cents) => {
        expect(parseAmountToCents(input)).toBe(cents);
    });

    it.each([
        ['', 'vide'],
        ['0', 'nul'],
        ['0,00', 'nul'],
        ['-5', 'négatif'],
        ['1,005', 'trois décimales'],
        ['12,', 'virgule sans décimales'],
        [',5', 'sans partie entière'],
        ['12,5,0', 'deux séparateurs'],
        ['abc', 'texte'],
        ['1e3', 'notation scientifique'],
        ['21474836,48', 'au-dessus du maximum'],
        ['99999999999999999999', 'trop grand'],
    ])('refuse « %s » (%s)', (input) => {
        expect(parseAmountToCents(input)).toBeNull();
    });

    it('retrouve exactement chaque centime de 0,01 € à 100,00 €', () => {
        for (let cents = 1; cents <= 10_000; cents += 1) {
            const euros = Math.floor(cents / 100);
            const rest = String(cents % 100).padStart(2, '0');
            expect(parseAmountToCents(`${euros},${rest}`)).toBe(cents);
        }
    });
});

describe('formatCents', () => {
    it.each([
        [0, '0,00 €'],
        [1, '0,01 €'],
        [29, '0,29 €'],
        [435, '4,35 €'],
        [4599, '45,99 €'],
        [31112, '311,12 €'],
        [123456, '1 234,56 €'],
        [MAX_AMOUNT_CENTS, '21 474 836,47 €'],
    ])('affiche %i centimes comme « %s »', (cents, expected) => {
        expect(plain(formatCents(cents))).toBe(expected);
    });

    it('est l’inverse exact de parseAmountToCents', () => {
        for (const cents of [1, 10, 99, 115, 435, 1005, 4599, 123456, MAX_AMOUNT_CENTS]) {
            expect(parseAmountToCents(formatCents(cents))).toBe(cents);
        }
    });
});