import { useCallback, useEffect, useRef, useState } from "react";
import { inferenceClient, type LoadProgress } from "../model/client";
import { liveCompositor, loadRecordedRun, recordedCompositor, type Compositor } from "../model/compositor";
import { detectDevice, findModel, type LocalModel, type ModelDevice } from "../model/registry";

export type CompositorState =
  | { readonly status: "waiting" }
  | { readonly status: "recorded"; readonly compositor: Compositor }
  | { readonly status: "absent" }
  | { readonly status: "loading"; readonly progress: LoadProgress | null; readonly fallback: Compositor | null }
  | { readonly status: "live"; readonly compositor: Compositor }
  | { readonly status: "failed"; readonly reason: string; readonly fallback: Compositor | null };

const forcedRecorded = () => new URLSearchParams(window.location.search).get("compositor") === "recorded";

export function useCompositor(locale: string, modelId: LocalModel["id"], optedIn: boolean) {
  const [state, setState] = useState<CompositorState>({ status: "waiting" });
  const [device, setDevice] = useState<ModelDevice>("wasm");
  const recorded = useRef<Compositor | null>(null);
  const optedInAtMount = useRef(optedIn);

  const load = useCallback(async () => {
    const chosenDevice = await detectDevice();
    setDevice(chosenDevice);
    setState({ status: "loading", progress: null, fallback: recorded.current });
    try {
      const actualDevice = await inferenceClient().loadModel(modelId, chosenDevice, (progress) =>
        setState({ status: "loading", progress, fallback: recorded.current }),
      );
      setState({ status: "live", compositor: liveCompositor(findModel(modelId), actualDevice) });
    } catch (error) {
      setState({ status: "failed", reason: error instanceof Error ? error.message : String(error), fallback: recorded.current });
    }
  }, [modelId]);

  useEffect(() => {
    let current = true;
    void detectDevice().then((d) => current && setDevice(d));
    void loadRecordedRun(locale).then((run) => {
      if (!current) return;
      recorded.current = run ? recordedCompositor(run) : null;
      setState((s) => {
        if (s.status === "live" || s.status === "loading") return s;
        return recorded.current ? { status: "recorded", compositor: recorded.current } : { status: "absent" };
      });
      if (optedInAtMount.current && !forcedRecorded()) void load();
    });
    return () => {
      current = false;
    };
  }, [locale, load]);

  const active =
    state.status === "live" || state.status === "recorded"
      ? state.compositor
      : state.status === "loading" || state.status === "failed"
        ? state.fallback
        : null;

  return { state, active, device, load };
}
