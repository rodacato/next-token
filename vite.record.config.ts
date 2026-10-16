import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

// For the recorders: no HMR and no file watching, so edits elsewhere never reload a long recording.
export default mergeConfig(
  base,
  defineConfig({
    server: {
      port: 5350,
      strictPort: true,
      hmr: false,
      watch: { ignored: ["**/*"] },
      // Cross-origin isolation lets ONNX Runtime use WASM threads when WebGPU is unavailable.
      headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" },
    },
  }),
);
