const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const absoluteFormat = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

// « Il y a 5 min », « Hier »… ; au-delà d'une semaine, la date complète.
export function formatRelativeTime(isoDate: string, now = new Date()): string {
    const date = new Date(isoDate);
    const elapsed = now.getTime() - date.getTime();

    if (elapsed < MINUTE) return "À l'instant";
    if (elapsed < HOUR) return `Il y a ${Math.floor(elapsed / MINUTE)} min`;
    if (elapsed < DAY) return `Il y a ${Math.floor(elapsed / HOUR)} h`;

    const days = Math.floor(elapsed / DAY);
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} j`;

    return absoluteFormat.format(date);
}
