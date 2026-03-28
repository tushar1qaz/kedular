import type { Metadata } from 'next';
import LandingNav from '@/components/landing/LandingNav';
import Footer from '@/components/shared/Footer';
import ChangelogEntry from '@/components/changelog/ChangelogEntry';
import changelogData from '@/content/changelog.json';

export const metadata: Metadata = {
  title: 'Changelog — Kedular',
  description: "What's new in Kedular — release notes and version history.",
};

interface ChangelogItem {
  date: string;
  version: string;
  title: string;
  changes: string[];
}

export default function ChangelogPage() {
  const entries = [...(changelogData as ChangelogItem[])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-slate-950 pt-24">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-white mb-3">Changelog</h1>
            <p className="text-slate-400 text-lg">
              All notable changes to Kedular, in reverse-chronological order.
            </p>
          </div>
          <div>
            {entries.map((entry) => (
              <ChangelogEntry
                key={entry.version}
                date={entry.date}
                version={entry.version}
                title={entry.title}
                changes={entry.changes}
              />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
