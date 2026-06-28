import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      let isMobileUA = false;
      if (typeof window !== 'undefined' && window.navigator) {
        const userAgent = navigator.userAgent;
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        isMobileUA = Boolean(userAgent.match(mobileRegex));
      }
      
      const isNarrowScreen = window.innerWidth <= breakpoint;
      
      setIsMobile(isMobileUA || isNarrowScreen);
    };

    checkMobile();
    
    // Add resize listener to update dynamically
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}
