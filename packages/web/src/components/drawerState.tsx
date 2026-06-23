import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Estado compartilhado do menu lateral MOBILE.
 *
 * Antes, o ☰ (AppBar) abria o Sidebar nativo do react-admin e o botão "Mais"
 * (rodapé) também tentava abri-lo via useSidebarState() — mas o Drawer do
 * react-admin tem chrome próprio (AppBar offset, largura fixa, espaçamentos)
 * que ficava VISIVELMENTE diferente do menu bonito. Os dois gatilhos também
 * divergiam.
 *
 * Agora ambos abrem o MESMO <AppDrawer> customizado (definido no App.tsx),
 * através deste contexto. Uma única fonte de verdade = menus idênticos.
 */
type DrawerCtx = { open: boolean; setOpen: (v: boolean) => void; openDrawer: () => void; closeDrawer: () => void };

const Ctx = createContext<DrawerCtx>({ open: false, setOpen: () => {}, openDrawer: () => {}, closeDrawer: () => {} });

export const DrawerProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const value: DrawerCtx = {
    open,
    setOpen,
    openDrawer: () => setOpen(true),
    closeDrawer: () => setOpen(false),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAppDrawer = () => useContext(Ctx);
