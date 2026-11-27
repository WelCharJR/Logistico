// Estações de exemplo (demonstração), posicionadas em relação às paredes do hangar:
// fuselagem do KC-390 no lado esquerdo e montagem final do Super Tucano na frente.
export function demoAreas(bounds) {
  const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const { minX, minZ, maxZ } = bounds;
  return [
    {
      id: "A-KC1",
      name: "Fuselagem KC-390",
      type: "fuselage",
      aircraft: "kc390",
      stage: "skin",
      points: rect(minX + 1.5, minZ + 11, minX + 13, minZ + 21),
    },
    {
      id: "A-ST1",
      name: "Montagem final ST",
      type: "final",
      aircraft: "tucano",
      stage: "complete",
      points: rect(minX + 9, maxZ - 13, minX + 26, maxZ - 2),
    },
  ];
}
