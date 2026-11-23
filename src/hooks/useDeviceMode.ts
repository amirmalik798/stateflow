import { useEffect, useState } from 'react';

function checkIsPhoneDrawDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isNarrowViewport = window.innerWidth < 900;
  return isCoarsePointer || isNarrowViewport;
}

export function useDeviceMode() {
  const [isPhoneDrawMode, setIsPhoneDrawMode] = useState<boolean>(checkIsPhoneDrawDevice);

  useEffect(() => {
    const update = () => setIsPhoneDrawMode(checkIsPhoneDrawDevice());
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return {
    isPhoneDrawMode,
    isReadOnly: !isPhoneDrawMode,
  };
}
