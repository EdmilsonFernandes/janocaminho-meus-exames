import { useState, useEffect } from 'react';

const KEY = 'selPatientId';
const EVENT = 'selPatientChanged';

/** Paciente selecionado no momento (default = paciente principal do usuário). */
export function getSelectedPatient(): string | null {
  return localStorage.getItem(KEY) || localStorage.getItem('patientId');
}

export function setSelectedPatient(id: string) {
  localStorage.setItem(KEY, id);
  window.dispatchEvent(new Event(EVENT));
}

/** Hook reativo: re-renderiza quando o paciente selecionado muda. */
export function useSelectedPatient(): [string | null, (id: string) => void] {
  const [pid, setPid] = useState<string | null>(getSelectedPatient());
  useEffect(() => {
    const handler = () => setPid(getSelectedPatient());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return [pid, setSelectedPatient];
}
