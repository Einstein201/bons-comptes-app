import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>Les Bons Comptes</h1>
      <p>On partage les bons moments ... </p>
      <nav aria-label="Compte">
        <Link href="/login">Se connecter</Link>
        {' · '}
        <Link href="/register">Créer un compte</Link>
        {' · '}
        <Link href="/wallets/new">Créer un porte-monnaie</Link>
      </nav>
    </main>
  );
}
