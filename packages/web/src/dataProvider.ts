import { fetchUtils } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { API_URL, apiHeaders } from './config';

const rest = simpleRestProvider(API_URL, (url, options: any = {}) => {
  return fetchUtils.fetchJson(url, { ...options, headers: { ...options.headers, ...apiHeaders() } });
});

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
