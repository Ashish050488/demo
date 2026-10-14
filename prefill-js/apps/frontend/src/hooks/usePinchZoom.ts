"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const MINIMUM_ZOOM = 1;
const MAXIMUM_ZOOM = 4;
const PINCH_SENSITIVITY = 0.01;

export interface PinchZoomState {
  zoom: number;
  panX: number;
  panY: number;
}

const RESTING_STATE: PinchZoomState = { zoom: 1, panX: 0, panY: 0 };

/** Trackpad pinch / Ctrl+wheel zooms only the element under `targetRef` (never the whole page), centred on the
 * pointer; a two-finger swipe pans while zoomed in. The listener is non-passive so browser zoom is blocked. */
export function usePinchZoom(targetRef: RefObject<HTMLElement | null>) {
  const [zoomState, setZoomState] = useState<PinchZoomState>(RESTING_STATE);
  const latestZoomState = useRef(RESTING_STATE);
  const applyZoomState = useCallback((nextState: PinchZoomState) => {
    latestZoomState.current = nextState;
    setZoomState(nextState);
  }, []);
  const resetZoom = useCallback(() => applyZoomState(RESTING_STATE), [applyZoomState]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const handleWheel = (event: WheelEvent) => {
      const bounds = target.getBoundingClientRect();
      const current = latestZoomState.current;
      if (event.ctrlKey) {
        event.preventDefault(); // a trackpad pinch arrives as ctrl + wheel
        const nextZoom = Math.min(MAXIMUM_ZOOM, Math.max(MINIMUM_ZOOM, current.zoom * Math.exp(-event.deltaY * PINCH_SENSITIVITY)));
        if (nextZoom === MINIMUM_ZOOM) { applyZoomState(RESTING_STATE); return; }
        const pointerX = event.clientX - bounds.left;
        const pointerY = event.clientY - bounds.top;
        const contentX = (pointerX - current.panX) / current.zoom;
        const contentY = (pointerY - current.panY) / current.zoom;
        applyZoomState({ zoom: nextZoom, panX: pointerX - contentX * nextZoom, panY: pointerY - contentY * nextZoom });
        return;
      }
      if (current.zoom === MINIMUM_ZOOM) return;
      event.preventDefault(); // pan the zoomed page instead of scrolling anything else
      const minimumPanX = bounds.width - bounds.width * current.zoom;
      applyZoomState({
        ...current,
        panX: Math.min(0, Math.max(minimumPanX, current.panX - event.deltaX)),
        panY: Math.min(bounds.height * 0.5, current.panY - event.deltaY),
      });
    };
    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  }, [targetRef, applyZoomState]);

  return { zoomState, resetZoom };
}
