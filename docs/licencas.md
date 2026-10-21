# Registro de Licenças de Assets — Simulador de Mecânico

Este documento registra a origem, autoria e licença de todos os modelos 3D, texturas, materiais, fontes e efeitos sonoros utilizados no projeto, conforme exigido pelo **Prompt 19** (`docs/roadmap-polimento.md`).

## 1. Regras de Conformidade

1. **Apenas licenças livres e compatíveis com distribuição comercial:**
   - **Autoria própria / Procedural no código:** licenciado sob a mesma licença do repositório.
   - **CC0 1.0 Universal (Domínio Público):** permitido sem restrições.
   - **MIT / BSD / Apache 2.0:** permitido com preservação do aviso de copyright neste arquivo.
2. **Proibido:**
   - Assets com cláusula **Non-Commercial (CC-BY-NC)**, **No-Derivatives (CC-BY-ND)** ou de origem desconhecida.
   - Marcas reais de veículos, autopeças, lubrificantes ou estabelecimentos comerciais (todas as marcas do jogo são 100% fictícias: *LubriMax*, *Baterias Trovão*, * Guanabara Autopeças*, *Ferro-Velho do Tião*, *Banco Carioca*, *Lanchonete da Tia Léa*).

---

## 2. Inventário de Assets

| Categoria | Identificador / Caminho | Tipo | Origem / Ferramenta | Autor | Licença |
| --- | --- | --- | --- | --- | --- |
| **Materiais PBR** | `src/world/materials/index.ts` | 10 materiais PBR (`concreto`, `metalPintado`, `metalCromado`, `borracha`, `plastico`, `vidro`, `azulejo`, `madeira`, `asfalto`, `pedraPortuguesa`) | Geração procedural determinística em Canvas 2D + Three.js | Equipe do Projeto (Gemini) | Repositório (Própria) |
| **Texturas de Cena** | `src/utils/canvasTextures.ts` | Mapas difusos, rugosidade, relevo, letreiros, cartazes e placas Mercosul fictícias | Geração procedural com semente fixa (`createSeededRandom`) | Equipe do Projeto (Gemini / Claude) | Repositório (Própria) |
| **Geometria — Oficina** | `src/world/Workshop.ts`, `src/world/workshop/*` | Galpão, elevador de 2 colunas, bancada, armário, estantes, ferramentas, ventilador de teto, rádio, quadro de luz | Modelagem procedural paramétrica em Three.js + `mergeStaticMeshes` + `InstancedMesh` | Equipe do Projeto (Gemini / Claude) | Repositório (Própria) |
| **Geometria — Bairro** | `src/world/CityNeighborhood.ts`, `src/world/CityLocationDetails.ts`, `src/world/city/*` | Rua das Oficinas (São Cristóvão), sobrados cariocas, calçada de pedra portuguesa, 5 fachadas, vegetação e mobiliário urbano | Modelagem procedural paramétrica em Three.js | Equipe do Projeto (Gemini) | Repositório (Própria) |
| **Geometria — Pátio** | `src/world/TestTrack.ts` | Pátio de test drive, cones, lombadas, muros e galpão | Modelagem procedural paramétrica em Three.js | Equipe do Projeto (Claude / Gemini) | Repositório (Própria) |
| **Geometria — Veículos** | `src/vehicles/PlaceholderCar.ts`, `src/vehicles/models/*` | 6 categorias (`popular`, `hatch`, `sedan`, `suv`, `picape`, `van`), interior, cofre do motor com 15 slots legíveis | Modelagem procedural paramétrica em Three.js | Equipe do Projeto (Gemini / Claude) | Repositório (Própria) |
| **Geometria — Personagens** | `src/characters/*` | Seu Zé, protagonista, 3 perfis de cliente e gerente do banco com animações procedurais | Modelagem e rigging procedural em Three.js | Equipe do Projeto (Gemini) | Repositório (Própria) |
| **Áudio e Trilha** | `src/audio/Sfx.ts`, `src/audio/*` | Foley de oficina, motor por estado mecânico, ambiência carioca e trilha adaptativa | Síntese procedural via Web Audio API | Equipe do Projeto (Gemini) | Repositório (Própria) |
| **Referências Visuais** | `docs/arte/ref-*.svg` | 3 pranchas vetoriais de referência da Direção Híbrida (A+B) | Ilustração vetorial SVG autoral | Equipe do Projeto (Gemini) | Repositório (Própria) |
| **Motor 3D e Loaders** | `three` (`GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `MeshoptDecoder`, `RoomEnvironment`) | Biblioteca de renderização WebGL | Three.js Authors | Mr.doob e colaboradores | MIT |

