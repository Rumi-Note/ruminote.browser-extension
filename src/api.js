import { API_BASE_URL, PLATFORM } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request(path, { token, body }) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Device-Token': token } : {})
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new ApiError('网络连接失败，请稍后重试', { payload: error });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('服务器返回了无法识别的内容', { status: response.status });
  }

  if (!response.ok || payload?.ok === false) {
    throw new ApiError(payload?.message || '同步请求失败', {
      status: response.status,
      code: payload?.code || `HTTP_${response.status}`,
      payload
    });
  }

  return payload;
}

export async function bindDevice(pairCode, device) {
  const payload = await request('/device/bind', {
    body: {
      pair_code: pairCode,
      device_id: device.deviceId,
      device_name: device.deviceName,
      platform: PLATFORM
    }
  });

  const token = payload.device_token;
  if (!token) throw new ApiError('绑定成功响应中缺少设备令牌', { code: 'INVALID_RESPONSE', payload });
  return { token, userId: payload.user_id ?? null };
}

export async function uploadHighlights(token, items) {
  return request('/highlights/batch', { token, body: { items } });
}
