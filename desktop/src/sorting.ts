export function sortableTitle(title: string) {
  const trimmed = title.trim();
  const withoutArticle = trimmed.replace(/^the\s+/i, '').trim();
  return withoutArticle || trimmed;
}

export function compareTitles(a: string, b: string) {
  return sortableTitle(a).localeCompare(sortableTitle(b), undefined, { sensitivity: 'base', numeric: true });
}

export function compareArtistsThenTitles(
  a: { artist?: string; title: string },
  b: { artist?: string; title: string }
) {
  return compareTitles(a.artist || a.title, b.artist || b.title) || compareTitles(a.title, b.title);
}

export function titleInitial(title: string) {
  const initial = sortableTitle(title).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : '#';
}
