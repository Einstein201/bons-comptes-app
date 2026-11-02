// Les dates « AAAA-MM-JJ » sont lues en UTC pour que le fuseau horaire ne décale pas le jour.
function toUtcDate(isoDate: string): Date {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

export function dayOfMonth(isoDate: string): string {
    return String(toUtcDate(isoDate).getUTCDate());
}

export function shortWeekday(isoDate: string): string {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })
        .format(toUtcDate(isoDate));
}

export function monthLabel(isoDate: string): string {
    const label = new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(toUtcDate(isoDate));
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function todayIsoDate(now = new Date()): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}