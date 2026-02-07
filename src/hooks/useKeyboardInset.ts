import * as React from "react";

/**
 * Tracks the current on-screen keyboard inset (bottom overlap) using VisualViewport.
 * Works best on mobile browsers where the viewport shrinks when the keyboard opens.
 */
export function useKeyboardInset() {
  const [bottomInset, setBottomInset] = React.useState(0);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const compute = () => {
      // When the keyboard opens, visualViewport.height shrinks.
      // offsetTop is relevant on iOS when the viewport is shifted.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setBottomInset(Math.round(inset));
    };

    compute();

    vv.addEventListener("resize", compute);
    vv.addEventListener("scroll", compute);
    window.addEventListener("orientationchange", compute);

    return () => {
      vv.removeEventListener("resize", compute);
      vv.removeEventListener("scroll", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return { bottomInset };
}
