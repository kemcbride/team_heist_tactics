import { MapPosition } from "../generated/types_pb";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  INTERNAL_SQUARE_SIZE,
  INTERNAL_TILE_OFFSET,
  TILE_SIZE,
} from "../constants/other";
import { CanvasPosition } from "./types";

export const mapPositionToCanvasPositionSingle = (
  n: number,
  pixel_offset: number,
  canvas_dimension_size_px: number,  // CANVAS_WIDTH or CANVAS_HEIGHT
  tile_offset: number
): number => {
  var num_tiles_away_from_center = Math.floor((n + tile_offset) / 4);
  var corner_canvas =
    (num_tiles_away_from_center * 2 + 1) * INTERNAL_TILE_OFFSET +
    n * INTERNAL_SQUARE_SIZE;
  var adjusted_canvas = corner_canvas + pixel_offset + canvas_dimension_size_px / 2;
  return adjusted_canvas;
}

export const mapPositionToCanvasPosition = (
  map_position: MapPosition,
  pixel_offset: number,
  tile_offset_x: number,
  tile_offset_y: number,
): CanvasPosition => {
  var map_x = map_position.getX();
  var map_y = map_position.getY();
  var canvas_x = mapPositionToCanvasPositionSingle(map_x, pixel_offset, CANVAS_WIDTH, tile_offset_x);
  var canvas_y = mapPositionToCanvasPositionSingle(map_y, pixel_offset, CANVAS_HEIGHT, tile_offset_y);
  return { x: canvas_x, y: canvas_y };
};

const canvasCoordToMapCoord = (
  coord: number,
  pixel_offset: number,
  canvas_dimension_size_px: number // CANVAS_WIDTH or CANVAS_HEIGHT
): number => {
  // We start this function with a canvas coordinate, and we want to translate it back to a MapPosition
  // The first thing we can do is reverse the last step -
  // we will subtract pixel offset, and the CANVAS center offset
  var adjusted_canvas_val = coord;
  // This value, corner_canvas_val, is how far away the position is from the corner of the canvas
  // If the corner of the canvas (0,0) was actually the center.
  var corner_canvas_val =
    adjusted_canvas_val - pixel_offset - canvas_dimension_size_px / 2;
  // We know that corner_canvas_val is the _sum_ of tile_offset and square_offset.
  // We need to get both of those values separately from this value, corner_canvas_val

  // I *think* we can get the tile offset first, and then use the remainder to determine the square offset
  var tile_offset = Math.floor(
    (corner_canvas_val / INTERNAL_TILE_OFFSET - 1) / 2
  );
  var canvas_square_offset = corner_canvas_val - tile_offset;
  var square_offset = Math.floor(canvas_square_offset / INTERNAL_SQUARE_SIZE);

  // Now that we have these, what do we really need next?
  // We need: num_tiles_away_from_center_val
  // ... now that I am reading this, I think we ought to rename it from num_tiles_away... to num_squares_away...
  var num_squares_away_from_center_val = /*tile_offset * 4 + */ square_offset;
  // For each tile, we're moved 4 away. For each square, it's 1 worth
  var map_coord = num_squares_away_from_center_val;
  return map_coord;
};

export const canvasPositionToMapPosition = (
  canvas_position: CanvasPosition,
  pixel_offset: number
): MapPosition => {
  var map_x = canvasCoordToMapCoord(
    canvas_position.x,
    pixel_offset,
    CANVAS_WIDTH
  );
  var map_y = canvasCoordToMapCoord(
    canvas_position.y,
    pixel_offset,
    CANVAS_HEIGHT
  );
  var out = new MapPosition();
  out.setX(map_x);
  out.setY(map_y);
  return out;
};

// NOTE: TODO: This fails at big numbers (251 and 252).
// Unit test of sorts.
var mp = new MapPosition();
mp.setX(1);
mp.setY(2);
console.log("map x y", mp.getX(), mp.getY());
var a = mapPositionToCanvasPosition(mp, 20, 0, 0);
console.log("canvas x y", a.x, a.y);
var b = canvasPositionToMapPosition(a, 20);
console.log("back to map x y", b.getX(), b.getY());
if (b.getX() != 1 || b.getY() != 2) {
  var msg = "Map -> canvas -> map position is wrong";
  console.error(msg);
  throw msg;
}
