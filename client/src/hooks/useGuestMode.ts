import { useLocation } from 'react-router-dom';

export function useGuestMode(): { isGuest: boolean; basePath: string } {
  const { pathname } = useLocation();
  const isGuest = pathname.startsWith('/guest');
  return {
    isGuest,
    basePath: isGuest ? '/guest' : '/user'
  };
}
