import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { localProgressStore } from "./host/course-state";
import { App } from "./ui/App";
import { CourseProvider } from "./ui/CourseProvider";
import { HostSync } from "./ui/HostSync";
import "./ui/theme.css";
import "./ui/bench.css";
import "./ui/layout.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <CourseProvider store={localProgressStore()}>
      <HostSync />
      <App />
    </CourseProvider>
  </StrictMode>,
);
