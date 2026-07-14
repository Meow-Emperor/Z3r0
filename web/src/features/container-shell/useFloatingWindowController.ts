import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animateWindowFlight,
  buildFlight,
  buildWindowFlightStyle,
  cancelFlightFrame,
  type DockSlot,
  type DragState,
  type FlightState,
  type WindowStateBase,
} from "./floatingWindow";

type FloatingWindowControllerOptions<State> = {
  dockSlot: DockSlot;
  flightMeta: string | ((state: State) => string);
  onClose?: () => void;
  onRestore?: () => void;
};

export function useFloatingWindowController<State extends WindowStateBase>({
  dockSlot,
  flightMeta,
  onClose,
  onRestore,
}: FloatingWindowControllerOptions<State>) {
  const [state, setState] = useState<State | null>(null);
  const [flight, setFlight] = useState<FlightState | null>(null);
  const stateRef = useRef<State | null>(null);
  const flightRef = useRef<HTMLDivElement | null>(null);
  const flightFrameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cancelFlight = useCallback(() => {
    cancelFlightFrame(flightFrameRef);
    setFlight(null);
  }, []);

  const close = useCallback(() => {
    cancelFlight();
    dragRef.current = null;
    onClose?.();
    stateRef.current = null;
    setState(null);
  }, [cancelFlight, onClose]);

  const minimize = useCallback(() => {
    if (!state) return;
    cancelFlightFrame(flightFrameRef);
    const meta = typeof flightMeta === "function" ? flightMeta(state) : flightMeta;
    setFlight(buildFlight(state, "minimize", dockSlot, meta));
    setState((current) => current ? { ...current, dockState: "minimized" } : current);
  }, [dockSlot, flightMeta, state]);

  const restore = useCallback(() => {
    if (!state) return;
    cancelFlightFrame(flightFrameRef);
    const meta = typeof flightMeta === "function" ? flightMeta(state) : flightMeta;
    setFlight(buildFlight(state, "restore", dockSlot, meta));
  }, [dockSlot, flightMeta, state]);

  useEffect(() => () => close(), [close]);

  useEffect(() => {
    if (!flight || !flightRef.current) return;
    return animateWindowFlight(flightRef.current, flight, flightFrameRef, () => {
      if (flight.direction === "restore") {
        onRestore?.();
        setState((current) => current ? { ...current, dockState: "normal" } : current);
      }
      setFlight(null);
    });
  }, [flight, onRestore]);

  return {
    state,
    setState,
    stateRef,
    flight,
    flightRef,
    flightStyle: flight ? buildWindowFlightStyle(flight) : undefined,
    dragRef,
    cancelFlight,
    close,
    minimize,
    restore,
  };
}
