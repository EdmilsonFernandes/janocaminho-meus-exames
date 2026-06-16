import { fetchUtils } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { API_URL, token } from './config';

// httpClient correto: usa Headers object (não spread de plain object)
const httpClient = (url: string, options: any = {}) => {
  const headers = new Headers(options.headers || {});
  const t = token();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  const pid = localStorage.getItem('selPatientId') || localStorage.getItem('patientId');
  if (pid) headers.set('X-Patient-Id', pid);
  return fetchUtils.fetchJson(url, { ...options, headers });
};

const rest = simpleRestProvider(API_URL, httpClient);

export const dataProvider = {
  ...rest,
  getList: (resource: string, params: any) => {
    if (['exams', 'items', 'measurements', 'reminders', 'vaccines'].includes(resource)) {
      const pid = localStorage.getItem('selPatientId') || localStorage.getItem('patientId');
      if (pid) params.filter = { ...params.filter, patientId: pid };
    }
    return rest.getList(resource, params);
  },
};
