# Guia de Direção de Arte — Simulador de Mecânico (Direção Híbrida A + B)

> **Decisão aprovada pelo Gustavo (GDD §1.6, §20.2 e Prompt 19):**
> **Direção Híbrida (A + B)** — combina a **silhueta limpa, legibilidade imediata de peças e geometria enxuta** da Direção A (low-poly estilizado) com **materiais PBR realistas, reflexos de verniz automotivo, manchas de óleo com baixa rugosidade e iluminação atmosférica carioca** da Direção B (semi-realista otimizado).

---

## 1. Pranchas de Referência Visual

1. **Interior da Oficina (`docs/arte/ref-01-oficina-interior.svg`):** contraste entre o galpão sombreado de meia-parede verde-oficina e a luz quente do Rio entrando pelo portão de aço.
2. **Bairro de São Cristóvão (`docs/arte/ref-02-fachada-sao-cristovao.svg`):** sobrados coloridos com platibanda, calçada de pedra portuguesa, fiação aérea e morros ao fundo.
3. **Veículo no Elevador e Cofre Legível (`docs/arte/ref-03-carro-elevador-pbr.svg`):** pintura automotiva com *clearcoat*, peças do cofre separadas por cor/material e destaque âmbar `#f2c230`.

---

## 2. Paleta Oficial de Cores (Tokens 3D ↔ UI)

Esta paleta é compartilhada entre os materiais 3D (`src/world/materials/`) e o sistema de design da interface (`src/ui/design/tokens.css` do Prompt 24):

### 2.1. Destaques de Interação e Interface
| Papel | Nome | Hex | Uso na Cena 3D e no HUD |
| --- | --- | --- | --- |
| Destaque Primário | Âmbar Oficina | `#f2c230` | Faixa de segurança na parede, destaque do tutorial (`setHighlight`), foco e mira na UI |
| Destaque Quente | Ouro Alerta | `#f59e0b` | Emissão de marcadores interativos, piscas âmbar, avisos de atenção |
| Fundo Escuro UI / Sombra | Grafite Profundo | `#14171a` | Fundo de painéis, cavidades internas do cofre, pneus e borrachas de vedação |
| Superfície Secundária | Chumbo Industrial | `#24292e` | Estruturas metálicas escuras, vigas do teto, colunas de sombra |
| Sucesso / Disponível | Verde Operacional | `#2fbf4a` | Botão de subida do elevador, LEDs de diagnóstico OK |
| Perigo / Indisponível | Vermelho Oficina | `#b3261e` | Armário de ferramentas, macaco jacaré, extintor, botão de parada |

### 2.2. Arquitetura da Oficina e Materiais Base
| Material (`src/world/materials/`) | Cor Base (Hex) | Rugosidade (`roughness`) | Metalicidade (`metalness`) | Onde aparece |
| --- | --- | --- | --- | --- |
| `concreto` | `#7a766f` | `0.85` (óleo `0.22`) | `0.05` | Piso da oficina, pátio e calçadas industriais |
| `azulejo` / Parede | `#d6cab4` / `#2b5852` | `0.58` / `0.84` | `0.04` | Meia-parede lavável verde-oficina + reboco superior |
| `metalPintado` (Azul) | `#24518a` | `0.42` | `0.35` | Colunas do elevador, morsa, estantes, porta lateral |
| `metalPintado` (Vermelho) | `#b3261e` | `0.36` | `0.45` | Armário de ferramentas, carrinho, macaco jacaré |
| `metalCromado` | `#dce0e4` | `0.16` | `0.96` | Ferramentas, puxadores, hastes, frisos e discos de freio |
| `borracha` | `#161618` | `0.92` | `0.02` | Pneus, mangueiras do motor, rodízios e apoios do elevador |
| `plastico` | `#23272b` | `0.62` | `0.08` | Caixas de filtro de ar, carcaça da bateria, scanner OBD-II |
| `vidro` | `#1b2834` | `0.08` | `0.15` | Para-brisas, janelas altas do galpão, vitrines do bairro |
| `madeira` | `#8d6238` | `0.68` | `0.04` | Tampo da bancada, mesa do escritório, engradados |
| `asfalto` | `#33363a` | `0.88` | `0.05` | Leito da Rua das Oficinas e pista de test drive |
| `pedraPortuguesa` | `#bfb8a8` / `#232528` | `0.82` | `0.02` | Calçadas tradicionais de São Cristóvão |

### 2.3. Paleta do Bairro de São Cristóvão (Sobrados Cariocas)
- **Ocre Imperial:** `#e9c46a`
- **Terracota Tijuca:** `#e76f51`
- **Azul Azulejo:** `#a8dadc`
- **Verde Imperial:** `#90be6d`
- **Pêssego Colonial:** `#f4a261`
- **Branco Cal:** `#f1faee`

---

## 3. Escala Métrica e Proporções (1 unidade = 1 metro)

Toda geometria 3D respeita medidas reais em metros para que a câmera em primeira pessoa (`altura dos olhos = 1.68 m`) passe sensação autêntica de presença:
- **Galpão da oficina:** `14 m` de largura (`x: -7..+7`) × `18 m` de profundidade (`z: -9..+9`) × `5.0 m` de pé-direito.
- **Vão do portão de enrolar:** `5.0 m` de largura × `4.0 m` de altura (`3.15 m` livres sob a folha entreaberta).
- **Bancada de trabalho:** `2.60 m` × `0.80 m`, tampo a `0.90 m` do chão.
- **Elevador de 2 colunas:** largura entre colunas `3.50 m`, altura das colunas `3.90 m`.
- **Porta de pedestres:** `1.05 m` de largura × `2.18 m` de altura.

---

## 4. Iluminação por Hora do Dia (`src/data/lighting.ts`)

O jogo usa `THREE.ACESFilmicToneMapping` e interpola suavemente entre 4 períodos definidos em `src/data/lighting.ts`:

| Período | Horário de Referência | Cor do Sol | Intensidade do Sol | Céu / Chão (`HemisphereLight`) | Exposição | Atmosfera |
| --- | --- | --- | --- | --- | --- | --- |
| **Manhã** (`manha`) | 08:00 (`480 min`) | `#ffe8c2` | `2.3` | `#d8ecff` / `#52483e` | `1.02` | Luz fresca dourada-clara, sombras longas |
| **Meio-dia** (`meio-dia`) | 12:30 (`750 min`) | `#fff8eb` | `3.0` | `#e8f4ff` / `#5c5346` | `1.08` | Sol alto tropical, alto contraste no portão |
| **Fim de tarde** (`fim-de-tarde`) | 17:15 (`1035 min`) | `#ffb870` | `2.1` | `#ffd8b8` / `#473930` | `0.98` | Dourado alaranjado clássico do Rio de Janeiro |
| **Noite** (`noite`) | 20:30 (`1230 min`) | `#6b88b8` | `0.35` | `#1e293b` / `#141619` | `0.86` | Luar frio lá fora; interior dominado pelas fluorescentes e postes âmbar |

---

## 5. Regras de Desgaste e Legibilidade de Gameplay

1. **Desgaste conta história, mas nunca polui a leitura:**
   - Manchas de óleo concentram-se sob os boxes de serviço e perto dos tambores de descarte.
   - A oficina começa com mais poeira/marcas de uso da época do tio e ganha organização visual conforme os upgrades (`iluminacao`, `armario-ferramentas`, `organizacao-estoque`, `chave-impacto`, `scanner`) sobem do nível 0 ao 3.
2. **Isolamento estrito entre desgaste externo e peças internas (Regra de Ouro #2):**
   - O desgaste visual externo do carro (poeira na carroceria, pontos de ferrugem no para-lama, amassados de batida no test drive) depende **exclusivamente** de idade do veículo, quilometragem, colisões de test drive e pneus visíveis a olho nu.
   - **Proibido:** vazar o estado real de peças internas ocultas (como bomba de combustível, vela, bobina ou termostato) na pintura externa do carro antes do diagnóstico.
3. **Orçamento de Desempenho por Nível de Qualidade:**
   - **Oficina:** `<= 250` chamadas de desenho (`draw calls`) e `<= 60.000` triângulos em qualidade alta.
   - **Bairro de São Cristóvão:** `<= 150` chamadas de desenho e `<= 30.000` triângulos.
   - **Pátio de Test Drive:** `<= 200` chamadas de desenho e `<= 30.000` triângulos.
   - Em qualidade `'baixa'`, os materiais desligam mapas secundários (`roughnessMap`, `bumpMap`, `aoMap`) e objetos puramente decorativos secundários ficam ocultos.

