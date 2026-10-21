import type { ReactNode } from 'react';
import { GhostIcon } from './Ghost';

/** Обложка экранов вне партии: ночное небо и пара привидений над заголовком. */
export function Page({ title = 'Бой привидений', subtitle, children }: {
  title?: string; subtitle?: string; children: ReactNode;
}) {
  return (
    <div className="page">
      <main className="page-main">
        <header className="page-head">
          <div className="page-ghosts" aria-hidden="true">
            <GhostIcon kind="good" owner="0" size={54} />
            <GhostIcon kind={null} owner="1" size={64} />
            <GhostIcon kind="evil" owner="0" size={54} />
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}
