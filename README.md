# beep-listener
- [beep-listener](#beep-listener)
  - [Instalando](#instalando)
  - [Desinstalando](#desinstalando)
  - [Atualizando](#atualizando)
  - [Como utilizar](#como-utilizar)
    - [Importação](#importação)
    - [Inicialização](#inicialização)
    - [Configuração da Frequência](#configuração-da-frequência)
    - [Calibração do Ganho do Microfone](#calibração-do-ganho-do-microfone)
    - [Filtros](#filtros)
    - [Captura do Beep](#captura-do-beep)
    - [Cuidados e Boas-Práticas](#cuidados-e-boas-práticas)

Classe que permite validar o acionamento do buzzer dos controladores via microfone, avaliando frequência, amplitude e tempo.

## Instalando

Abra o terminal, e na pasta do script, rode:

```
npm i @libs-scripts-mep/beep-listener
```

## Desinstalando

Abra o terminal, e na pasta do script, rode:

```
npm uninstall @libs-scripts-mep/beep-listener
```

## Atualizando

Abra o terminal, e na pasta do script, rode:

```
npm update @libs-scripts-mep/beep-listener
```

## Como utilizar

### Importação

Realize a importação:

```js
import BeepListener from "../node_modules/@libs-scripts-mep/beep-listener/beep-listener.js"
```

### Inicialização

- Utilize o método `Init()` para obter acesso ao microfone e inicializar as instâncias do AudioContext e AnalyserNode;
- Verifique no JSDocs as possibilidades de parâmetros;
- É possível passar o deviceId para não ocorrer o problema de múltiplos microfones conectados no computador e acabar utilizando o microfone errado;
- EX: 
```js 
 await BeepListener.Init({ deviceId: await BeepListener.C930e() })
```

### Configuração da Frequência

- Utilize o método `FrequencyReader()` para obter o valor da frequência lida pelo microfone; 
- A partir deste valor é possível configurar a calibração do ganho do microfone e captura dos dados.

### Calibração do Ganho do Microfone

- Utilize o método `calibrateMic()` para calibrar o ganho do microfone.
- Este método ajusta o ganho do microfone, fazendo com que a frequência lida fique dentro da amplitude desejada.

### Filtros

- É possível adicionar filtros ou outras funcionalidades para manipular as faixas lidas pelo microfone;
- Utilize o método `changeFilters()` para alterar os filtros, onde ele recebe por parâmetro um array de AudioNodes;
- Dentre os AudioNodes, podem ser utilizados GainNodes, BiquadFilterNodes, etc.;
- Para criar um BiquadFilterNode do tipo passa-faixa, utilize o método `createBandpassFilter()`, que vai ajustar o filtro para um determinado range de frequência;
- EX:
```js
BeepListener.changeFilters([BeepListener.createBandpassFilter(3050, 3200), BeepListener.createBandpassFilter(3050, 3200)])
```
- A biblioteca também possui filtros prontos, basta invocar o método `setBandpassFilters()`, que cria e aplica 10 filtros passa-faixa para filtrar as frequências de interesse.

### Captura do Beep

- Utilize o método `Capture()` para capturar os dados do microfone;
- Instruções mais detalhadas no JSDocs.

### Cuidados e Boas-Práticas

- Em capturas que utilizam validação por amplitude, o ganho do microfone deve ser calibrado para maior repetibilidade do teste;
- Caso aplique filtros de frequência, a validação obrigatoriamente deve ser por amplitude também, caso contrário ocorrerão falsas aprovações, já que o microfone sempre lerá na frequência da captura;
- Ao calibrar o microfone, acione o beep por um período de tempo (±1000ms) antes de invocar o método `calibrateMic()`, pois ocorre um efeito em que a amplitude da faixa é maior quando o microfone a escuta no início. Após este tempo, a amplitude estabiliza;
- Beeps contínuos são melhores para detecção do que beeps intermitentes, justamente pelo efeito mencionado acima. Caso receba uma peça com comunicação e beep intermitente, solicite uma mudança no firmware.