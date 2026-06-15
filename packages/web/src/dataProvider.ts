import { fetchUtils } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { API_URL, token } from './config';

// Injeta o JWT em toda requisição do react-admin.
const authedHttpClient = (url: RequestInfo, options: fetchUtils.Options = {}) => {
  const headers = new Headers(options.headers || {});
  const t = token();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return fetchUtils.fetchJson(url, { ...options, headers });
};

export const dataProvider = simpleRestProvider(API_URL, authedHttpClient);
