# Hangar Digital · Logística

Aplicação local para organizar um hangar de fabricação aeronáutica em uma cena 3D. Permite posicionar e girar kanbans, cadastrar materiais por caixa, buscar itens, desenhar áreas e rotas, e salvar os dados no navegador.

## Visual

- Cena 3D clara em estilo maquete: galpão com docas, letreiro, estantes kanban com cantos arredondados e sombras suaves.
- Enfeites animados (sem função no layout): caminhão na doca, empilhadeiras, paletes, carregador e rua com tráfego.
- Interface em cards flutuantes: indicadores, detalhes do item selecionado, lista em abas, localização do material e gaveta de materiais.
- Pinos azuis marcam o kanban selecionado e os resultados da busca.

## Requisitos

- Node.js 20 ou superior

## Executar

```bash
npm install
npm run dev
```

Abra o endereço local mostrado pelo Vite.

## Outros comandos

```bash
npm run build
npm run preview
npm test
```

Os dados do layout são armazenados no `localStorage` do navegador. Use as opções de backup na aplicação para exportar ou restaurar um arquivo JSON.
