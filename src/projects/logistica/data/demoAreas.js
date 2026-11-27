// Estações de exemplo (demonstração), posicionadas em relação às paredes do hangar:
// fuselagem do KC-390 no lado esquerdo e montagem final do Super Tucano na frente.
// As três cores do andon: fuselagem do KC-390 parada (gabarito com verificação vencida), montagem
// final do Super Tucano aguardando material (o O-ring NAS1611 não está em nenhum kanban do layout
// inicial) e asa do Super Tucano em montagem — com a seta de fluxo da asa para a montagem final.
export function demoAreas(bounds, now = Date.now()) {
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
  const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const { minX, minZ, maxZ } = bounds;
  return [
    {
      id: "A-KC1",
      name: "Fuselagem KC-390",
      type: "fuselage",
      aircraft: "kc390",
      status: "working",
      progress: 55,
      materials: ["MS21042L3", "NAS1097AD4-4"],
      jig: { code: "GAB-FUS-390-01", checkedAt: daysAgo(196), intervalDays: 180 },
      points: rect(minX + 1.5, minZ + 11, minX + 13, minZ + 21),
    },
    {
      id: "A-ST1",
      name: "Montagem final ST",
      type: "final",
      aircraft: "tucano",
      status: "working",
      progress: 85,
      materials: ["MS21042L3", "NAS1611-012"],
      jig: { code: "GAB-MF-ST-01", checkedAt: daysAgo(40), intervalDays: 180 },
      points: rect(minX + 9, maxZ - 13, minX + 26, maxZ - 2),
    },
    {
      id: "A-ST2",
      name: "Asa ST",
      type: "wing",
      aircraft: "tucano",
      status: "working",
      progress: 30,
      materials: ["NAS1097AD4-4", "MS21042L3"],
      jig: { code: "GAB-ASA-ST-01", checkedAt: daysAgo(20), intervalDays: 180 },
      points: rect(minX + 31, maxZ - 11, minX + 41, maxZ - 4),
    },
  ];
}
