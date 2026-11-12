import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startAudio } from "./audio/engine.ts";
import { startSoundPreference } from "./audio/soundPreference.ts";
import { RealtimeProvider } from "./realtime/index.ts";
import { createQueryClient } from "./queryClient.ts";
import { createAppRouter } from "./router.tsx";
import { startMotionPreference } from "./styles/motionPreference.ts";
import { startThemePreference } from "./styles/themePreference.ts";
import "./styles/tokens.css";
import "./styles.css";

startMotionPreference();
startThemePreference();
startSoundPreference();
startAudio();

const queryClient = createQueryClient();
const router = createAppRouter({ queryClient });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <RouterProvider router={router} />
      </RealtimeProvider>
      <ReactQueryDevtools />
    </QueryClientProvider>
  </StrictMode>,
);
