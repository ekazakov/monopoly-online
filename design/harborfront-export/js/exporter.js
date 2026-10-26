// Turns the generated avatar figures and board pieces into binary glTF (.glb) bytes.
// Nothing here touches the DOM, so the figure part also runs under Node for testing.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { avatarGeometry, avatarFigure, metal, AVATAR_HEIGHT } from './sculpt.js';

export const KINDS = Object.keys(AVATAR_HEIGHT);

export function toGLB(object) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(object, resolve, reject, { binary: true });
  });
}

// One figure standing on y = 0, sized to its height in the app. The metal has no environment map,
// since that is generated at runtime and cannot be exported; any glTF viewer supplies its own.
export function figureScene(kind, res = 90, hex = 0xc4cad1) {
  const fig = avatarFigure(avatarGeometry(kind, res), metal(hex, null), AVATAR_HEIGHT[kind], Infinity);
  fig.name = kind;
  return fig;
}
