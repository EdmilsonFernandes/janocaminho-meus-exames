import { fetchUtils } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { API_URL, token } from './config';

const authedHttpClient = (url: RequestInfo, options: fetchUtils.Options = {}) => {
  const headers = new Headers(options.headers || {});
  const t = token();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return fetchUtils.fetchJson(url, { ...options, headers });
};

const rest = simpleRestProvider(API_URL, authedHttpClient);

export const dataProvider = {
  ...rest,
  // GARANTE que toda lista de recursos por-paciente inclua o patientId selecionado
  getList: (resource: string, params: any) => {
    if (['exams', 'items', 'measurements', 'reminders'].includes(resource)) {
      const pid = localStorage.getItem('selPatientId') || localStorage.getItem('patientId');
      if (pid) params.filter = { ...params.filter, patientId: pid };
    }
    return rest.getList(resource, params);
  },
};
