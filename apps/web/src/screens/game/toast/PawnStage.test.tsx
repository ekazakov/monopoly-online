import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { recordFixture } from "../../../game/fixtures.ts";
import { resetWebGlSupportForTests } from "../../../scene/webglSupport.ts";
import { PawnStage } from "./PawnStage.tsx";

// A stand-in renderer. It keeps a list of every instance, so a test can see a stage built again.
const mocks = vi.hoisted(() => {
  const renderers: FakeRenderer[] = [];
  class FakeRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false };
    toneMapping = 0;
    toneMappingExposure = 1;
    setPixelRatio = vi.fn<(ratio: number) => void>();
    setSize = vi.fn<(width: number, height: number, updateStyle: boolean) => void>();
    render = vi.fn<(scene: unknown, camera: unknown) => void>();
    setAnimationLoop = vi.fn<(callback: null) => void>();
    dispose = vi.fn<() => void>();
    forceContextLoss = vi.fn<() => void>();
    constructor() {
      renderers.push(this);
    }
  }
  return { renderers, FakeRenderer };
});

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: mocks.FakeRenderer,
}));

vi.mock("../../../scene/sculpt.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../scene/sculpt.ts")>()),
  studioEnvironment: () => ({ texture: null, dispose: () => {} }),
}));

const token = recordFixture(1).seats.a.token;

describe("PawnStage", () => {
  beforeEach(() => {
    mocks.renderers.length = 0;
    resetWebGlSupportForTests();
    // The stage uses WebGL when the browser gives a context. jsdom gives none, so this stubs one.
    // The probe calls getExtension to release its context, so the stub has it too.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      getExtension: () => null,
    } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("the stage is built again on a new canvas after a WebGL context restore", () => {
    const { container } = render(<PawnStage token={token} size={150} />);
    expect(mocks.renderers).toHaveLength(1);
    const first = mocks.renderers[0]!;
    const firstCanvas = first.domElement;
    expect(container.querySelector(".turn-toast__figure")).toContainElement(firstCanvas);
    expect(first.render).toHaveBeenCalledTimes(1);

    act(() => {
      firstCanvas.dispatchEvent(new Event("webglcontextrestored"));
    });

    // The old stage is torn down and a new renderer draws on a new canvas in the same place.
    expect(mocks.renderers).toHaveLength(2);
    const second = mocks.renderers[1]!;
    expect(first.dispose).toHaveBeenCalled();
    const canvas = container.querySelector(".turn-toast__figure canvas");
    expect(canvas).toBe(second.domElement);
    expect(canvas).not.toBe(firstCanvas);
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(second.render).toHaveBeenCalledTimes(1);
  });

  test("unmounting the stage frees its WebGL context", () => {
    const { unmount } = render(<PawnStage token={token} size={150} />);
    const renderer = mocks.renderers[0]!;
    unmount();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  test("the WebGL probe runs once, however many stages mount", () => {
    for (let i = 0; i < 3; i++) {
      render(<PawnStage token={token} size={150} />).unmount();
    }
    const probeSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const probes = probeSpy.mock.calls.filter(([type]) => type === "webgl2");
    expect(probes).toHaveLength(1);
  });
});
