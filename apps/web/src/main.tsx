import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RealtimeProvider } from "./realtime/index.ts";
import { createQueryClient } from "./queryClient.ts";
import { createAppRouter } from "./router.tsx";
import { startMotionPreference } from "./styles/motionPreference.ts";
import "./styles/tokens.css";
import "./styles.css";

startMotionPreference();

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
