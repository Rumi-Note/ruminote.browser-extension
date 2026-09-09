export const API_BASE_URL = 'https://cloud1-d7g8j2h4675ed447b-1480876426.ap-shanghai.app.tcloudbase.com/ruminateapi';
export const PLATFORM = 'weread';
export const MAX_BATCH_SIZE = 100;

export function classifyWereadPage(url) {
  try {
    const page = new URL(url);
    if (page.protocol !== 'https:' || page.hostname !== 'weread.qq.com') return 'other';
    return page.pathname.startsWith('/web/reader/') ? 'reader' : 'weread';
  } catch {
    return 'other';
  }
}
