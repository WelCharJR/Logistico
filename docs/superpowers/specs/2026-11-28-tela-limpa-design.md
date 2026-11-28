# Tela limpa: busca em primeiro plano

## Por quê
A tela abre com ~9 blocos de informação ao mesmo tempo. O uso principal é **procurar material**,
então a busca e o 3D devem dominar; o resto aparece quando tem algo a dizer.

## Objetivos / não objetivos
- Objetivo: ao abrir, ver só barra de cima enxuta, busca, cena 3D, ferramentas e zoom.
- Objetivo: nada some do app; cada coisa fica a no máximo 1 clique.
- Não objetivo: mudar o que aparece dentro do 3D (etiquetas, totens, setas) nem criar modos Consultar/Editar.
- Anti-objetivo: procurar material ficar mais difícil ou mais lento.

## Abordagens consideradas
- **A. Busca em primeiro plano, o resto sob demanda** — escolhida pelo Wel: resolve a poluição sem mudar o jeito de trabalhar.
- B. Modos Consultar/Editar — mais limpo, porém obriga a alternar quando se procura e ajusta junto.
- C. Só aparar — rápido, mas a tela continua cheia.

## Desenho
| Bloco | Hoje | Depois |
| --- | --- | --- |
| Indicadores (5 cards) | Faixa fixa sob a barra | Um selo ao lado da busca: "2 alertas" (cor da situação) ou "Estoque ok"; clique abre os 5 cards num painel |
| Localização do material | Sempre, mesmo vazio | Só com um kanban selecionado (busca ou clique) |
| "Como usar" (legenda) | Card fixo quando nada está selecionado | Botão "?" na barra; abre sozinho só na primeira visita |
| Lista kanbans/áreas/caminhos | Card aberto | Pílula "Lista" no canto; clique abre o card atual |
| Grade, estrutura, dia/noite, visualização, tamanho do hangar | 5 ícones soltos | Um botão "Visualização" com menu de opções nomeadas |
| Dica de teclado | Sempre | Só com kanban/área selecionado e fora do modo visualização |
| Selo "Local · hora" | Separado | Vai para o subtítulo do projeto ("Salvo neste navegador · 03:08") |
| Busca | Largura atual | Mais larga, é o centro da barra |

Ficam como estão: rail de ferramentas, zoom, Rota, Materiais, + Kanban, cards de detalhe/área ao selecionar.

## Decisões minhas (para conferir)
- Primeira visita guardada no navegador (mesma forma do resto do app).
- Painéis abertos fecham com Esc ou clique fora; nenhum novo atalho de teclado.
- Em celular o comportamento atual dos cards continua (já escondem coisas).
