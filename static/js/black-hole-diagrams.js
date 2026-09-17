(() => {
  const container = document.getElementById("ray-direction");
  if (!container || !window.JXG) return;
  const figure = container.closest("figure");
  const rad = Math.PI / 180;
  const add = (a, b) => a.map((v, j) => v + b[j]);
  const mul = (a, s) => a.map(v => v * s);
  const unit = a => mul(a, 1 / Math.hypot(...a));
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const inclination = 55 * rad;
  const orientation = 35 * rad;
  const normal = [Math.cos(inclination), 0, Math.sin(inclination)];
  const transverse = [0, Math.cos(orientation), Math.sin(orientation)];
  const lightNormal = cross([1, 0, 0], transverse);
  const geometry = {
    transverse,
    intersection: unit(cross(lightNormal, normal)),
    diskV: [-Math.sin(inclination), 0, Math.cos(inclination)],
  };
  let board;

  container.hidden = false;
  try {
    board = JXG.JSXGraph.initBoard(container.id, {
      boundingbox: [-6.7, 5, 6.7, -5], keepaspectratio: true,
      renderer: "svg", showNavigation: false, showCopyright: false,
      pan: { enabled: false }, zoom: { enabled: false },
      title: "Disk plane, light plane, and their intersection",
      description: "Drag to rotate the disk plane, light plane, and their line of intersection.",
    });
    const view = board.create("view3d", [[-5.1, -3.9], [10.2, 7.8], [[-3.5, 3.5], [-3.5, 3.5], [-3.5, 3.5]]], {
      projection: "parallel", axesPosition: "none",
      trackball: { enabled: false },
      az: { slider: { visible: false, start: 0.8 } },
      el: { slider: { visible: false, start: 1.1 } },
      bank: { slider: { visible: false } },
      xPlaneRear: { visible: false }, yPlaneRear: { visible: false }, zPlaneRear: { visible: false },
    });
    const blue = "var(--ray-blue)", purple = "var(--ray-purple)", gold = "var(--ray-yellow)";
    const resolve = p => typeof p === "function" ? p() : p;
    const coords = p => [0, 1, 2].map(j => () => resolve(p)[j]);
    const line = (a, b, color, options = {}) => view.create("line3d", [coords(a), coords(b)], {
      straightFirst: false, straightLast: false, strokeColor: color, strokeWidth: 2,
      fixed: true, highlight: false, point1: { visible: false }, point2: { visible: false }, ...options,
    });
    const polygon = (vertices, color, opacity) => view.create("polygon3d",
      vertices.map(p => view.create("point3d", coords(p), { visible: false, fixed: true })), {
        fillColor: color, fillOpacity: opacity, strokeColor: color, strokeWidth: 1, highlight: false,
        borders: { strokeColor: color, strokeWidth: 1, highlight: false },
      });
    // Disk basis: e_y and diskV. Its normal makes angle i with e_x.
    polygon(Array.from({ length: 64 }, (_, k) => () => {
      const t = k * 2 * Math.PI / 64;
      return add([0, 2.8 * Math.cos(t), 0], mul(geometry.diskV, 2.8 * Math.sin(t)));
    }), blue, 0.13);
    // A finite patch of the light plane; both planes pass through the origin.
    polygon([() => add([-3, 0, 0], mul(geometry.transverse, -3)),
      () => add([3, 0, 0], mul(geometry.transverse, -3)),
      () => add([3, 0, 0], mul(geometry.transverse, 3)),
      () => add([-3, 0, 0], mul(geometry.transverse, 3))], purple, 0.13);
    line(() => mul(geometry.intersection, -2.8),
      () => mul(geometry.intersection, 2.8), gold, { strokeWidth: 4 });

    figure.classList.add("is-ready");
  } catch (error) {
    if (board) JXG.JSXGraph.freeBoard(board);
    container.hidden = true;
    console.error("Could not initialize the 3D ray diagram", error);
  }
})();
