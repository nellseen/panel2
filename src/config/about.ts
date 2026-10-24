export interface AboutConfig {
  authorName: string;
  authorUrl?: string;
  repositoryUrl?: string;
  license: string;
  version: string;
  fallbackNote: string;
}

export function getAboutConfig(envOverride?: Record<string, string | undefined>): AboutConfig {
  const env = envOverride ?? (typeof import.meta !== 'undefined' ? (import.meta.env as Record<string, string | undefined>) : {});
  
  const rawAuthor = (env?.VITE_APP_AUTHOR || '').trim();
  const rawAuthorUrl = (env?.VITE_APP_AUTHOR_URL || '').trim();
  const rawRepoUrl = (env?.VITE_APP_REPOSITORY_URL || '').trim();

  // If author is not provided, use default repo author 'nellseen' or neutral fallback
  const authorName = rawAuthor || 'nellseen';
  const repositoryUrl = rawRepoUrl || 'https://github.com/nellseen/panel2';
  const authorUrl = rawAuthorUrl || (authorName === 'nellseen' ? 'https://github.com/nellseen' : undefined);

  return {
    authorName,
    authorUrl,
    repositoryUrl,
    license: 'MIT License',
    version: '1.0.0',
    fallbackNote: 'Built with care for developers.',
  };
}
