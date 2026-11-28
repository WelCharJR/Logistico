# Tela limpa — Plano de implementação

> Executado em modo nativo (Wel pediu para seguir direto).

**Goal:** Busca e 3D dominam a tela; indicadores, legenda, localização, lista e opções de visualização aparecem sob demanda.
**Architecture:** Só React/CSS no app existente; uma função pura nova para o selo de alertas; o resto é estado de abrir/fechar no App.
**Tech Stack:** React, Vite, lucide-react, node:test.
**Spec:** docs/superpowers/specs/2026-11-28-tela-limpa-design.md

## Global Constraints
- Nada some do app: tudo a no máximo 1 clique. Painéis fecham com Esc ou clique fora.
- Legenda abre sozinha só na primeira visita (localStorage `logistico:help-seen`).
- Nada muda dentro do 3D.

## Review Focus
- Busca selecionando um kanban: a Localização aparece (antes ficava sempre).
- Modo visualização: menu "Visualização" continua oferecendo sair do modo; "Tamanho do hangar" some.
- Esc com painel aberto fecha o painel, sem desmarcar o kanban selecionado.
- Celular (≤ 420 px): selo e menu cabem na barra.
- Primeira visita com localStorage bloqueado: não quebra (try/catch).

### Task 1: selo de alertas
- Modify `data/stock.js`: `alertBadge(alerts) -> { label, tone }`.
  - out>0 → tone "red"; low>0 → "amber"; senão unknown>0 → "gray" com "N sem conferência"; senão "Estoque ok", tone "ok".
  - label "1 alerta" / "N alertas" (low+out).
- Test em `data/stock.test.js`: os quatro casos e singular/plural.

### Task 2: barra de cima
- `TopBar.jsx`: selo (abre `KpiCards` num painel), botão "Visualização" com menu (Grade, Estrutura, Dia/Noite/Ciclo, Modo visualização, Tamanho do hangar), botão "?" (legenda), hora no subtítulo do projeto, busca mais larga.

### Task 3: App e cards
- `App.jsx`: estados `kpiOpen`, `viewMenuOpen`, `helpOpen` (primeira visita), `listOpen`; Esc fecha painéis.
- `DetailCard.jsx`: legenda só quando `helpOpen`.
- `TrackCard`: só quando `selected` é kanban.
- `ListCard`: pílula "Lista" quando fechado.
- `ScenePanel.jsx`: dica de teclado só com seleção e fora do modo visualização.

### Task 4: CSS + conferência visual
- Remover a faixa `.log-kpis` fixa; estilos de selo, menu, pílula; mobile.
- Rodar `npm test`, `vite build` e conferir no navegador.
