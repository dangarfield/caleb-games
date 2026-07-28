// Shape registry
import { CubeShape } from './cube.js';
import { CylinderShape } from './cylinder.js';
import { SphereShape } from './sphere.js';
import { SuitcaseShape } from './suitcase.js';
import { BriefcaseShape } from './briefcase.js';

export const SHAPES = {
  cube: CubeShape,
  cylinder: CylinderShape,
  sphere: SphereShape,
  suitcase: SuitcaseShape,
  briefcase: BriefcaseShape,
};

export function getShape(name) {
  return SHAPES[name] || CubeShape;
}
