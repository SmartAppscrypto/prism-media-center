const sourceOrigin = 'https://shotonwhat.com';
const userAgent = 'PrismMedia/0.9 (+private personal metadata client)';
const requestDelayMs = 1500;
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function normalizeTitle(value) {
  return slugify(decodeHtml(value)).replace(/^(a|an|the)-/, '');
}

function termsArray(terms, key) {
  const values = terms?.[key];
  return Array.isArray(values) ? values.map((value) => decodeHtml(value)).filter(Boolean) : [];
}

function parseShotOnWhatPage(html, expectedTitle, expectedYear, sourceUrl) {
  const match = html.match(/var dataLayer_content\s*=\s*(\{[\s\S]*?\});\s*\n?dataLayer\.push/);
  if (!match) return null;
  let data;
  try { data = JSON.parse(match[1]); }
  catch { return null; }

  const ogTitle = decodeHtml(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? '');
  const titleMatch = ogTitle.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  if (!titleMatch || Number(titleMatch[2]) !== Number(expectedYear)) return null;
  if (normalizeTitle(titleMatch[1]) !== normalizeTitle(expectedTitle)) return null;

  const terms = data.pagePostTerms ?? {};
  const cinematographers = [...html.matchAll(/Cinematography by\s*\|\s*([\s\S]*?)<br\s*\/?\s*>/gi)]
    .flatMap((entry) => [...entry[1].matchAll(/>([^<>]+)<\/a>/g)].map((person) => decodeHtml(person[1].trim())))
    .filter((name, index, all) => name && all.indexOf(name) === index);
  const details = {
    acquisition: termsArray(terms, 'acquisition'),
    cameras: termsArray(terms, 'cameras'),
    lenses: termsArray(terms, 'lenses'),
    lensManufacturers: termsArray(terms, 'lens-manufacturer'),
    cameraAperture: termsArray(terms, 'camera-aperture'),
    filmStock: termsArray(terms, 'film-negative-stock'),
    filmGauge: termsArray(terms, 'film-negative-width'),
    captureResolution: termsArray(terms, 'capture-resolution'),
    captureFormats: termsArray(terms, 'capture-codecs-formats'),
    projectResolution: termsArray(terms, 'project-resolution'),
    frameRate: termsArray(terms, 'project-frame-rate'),
    finishingProcess: termsArray(terms, 'finishing-method'),
    aspectRatio: termsArray(terms, 'distributed-aspect-ratio'),
    cinematographers,
    sourceUrl,
    source: 'ShotOnWhat'
  };
  const hasProductionData = Object.entries(details).some(([key, value]) => key !== 'sourceUrl' && key !== 'source' && Array.isArray(value) && value.length);
  return hasProductionData ? details : null;
}

async function fetchPage(url) {
  const parsed = new URL(url);
  if (parsed.origin !== sourceOrigin) throw new Error('Unexpected ShotOnWhat URL.');
  const task = requestQueue.then(async () => {
    const wait = Math.max(0, requestDelayMs - (Date.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const response = await fetch(parsed, {
      headers: { Accept: 'text/html', 'User-Agent': userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000)
    });
    if (response.status === 429) {
      const error = new Error('ShotOnWhat asked PRISM to slow down.');
      error.code = 'RATE_LIMITED';
      throw error;
    }
    if ([502, 503, 504].includes(response.status)) {
      const error = new Error('ShotOnWhat is temporarily unavailable.');
      error.code = 'SOURCE_UNAVAILABLE';
      throw error;
    }
    if (!response.ok) return null;
    return response.text();
  });
  requestQueue = task.catch(() => undefined);
  return task;
}

async function findShotOnWhatPage(title, year) {
  const directUrl = `${sourceOrigin}/${slugify(title)}-${year}`;
  const directHtml = await fetchPage(directUrl);
  const direct = directHtml && parseShotOnWhatPage(directHtml, title, year, directUrl);
  if (direct) return direct;

  const searchUrl = `${sourceOrigin}/?s=${encodeURIComponent(`${title} ${year}`)}`;
  const searchHtml = await fetchPage(searchUrl);
  if (!searchHtml) return null;
  const candidates = [...searchHtml.matchAll(/href=["'](https:\/\/shotonwhat\.com\/([a-z0-9-]+-\d{4}))["']/gi)]
    .map((entry) => entry[1])
    .filter((url, index, all) => url.endsWith(`-${year}`) && all.indexOf(url) === index)
    .slice(0, 6);
  for (const candidate of candidates) {
    if (candidate === directUrl) continue;
    const html = await fetchPage(candidate);
    const parsed = html && parseShotOnWhatPage(html, title, year, candidate);
    if (parsed) return parsed;
  }
  return null;
}

module.exports = { findShotOnWhatPage, parseShotOnWhatPage, slugify };
