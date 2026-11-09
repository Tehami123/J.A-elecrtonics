export const privateApiCacheHeaders = {
  'Cache-Control': 'private, max-age=10, stale-while-revalidate=59',
  Vary: 'Cookie'
};
