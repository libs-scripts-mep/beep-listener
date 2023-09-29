# beep-listener
- [beep-listener](#beep-listener)
  - [Instalando](#instalando)
  - [Desinstalando](#desinstalando)
  - [Exemplo de Utilização](#exemplo-de-utilização)
    - [Init()](#init)
    - [Quais valores configurar no método Capture()?](#quais-valores-configurar-no-método-capture)
      - [LeituraFrequenciaParaConfigurar()](#leiturafrequenciaparaconfigurar)
      - [DeterminaFrequenciaAmplitudeParaConfigurar()](#determinafrequenciaamplitudeparaconfigurar)
    - [Capture()](#capture)

Classe que permite validar o acionamento do buzzer dos controladores via microfone, avaliando frequência, amplitude e tempo.

## Instalando

Abra o terminal, e na pasta do script, rode:

```
npm i @libs-scripts-mep/beep-listener
```

Após a instalação, inclua no html:

``` html
<script src="node_modules/@libs-scripts-mep/beep-listener/beep-listener.js"></script>
```

## Desinstalando

Abra o terminal, e na pasta do script, rode:

```
npm uninstall @libs-scripts-mep/beep-listener
```

## Exemplo de Utilização

### Init()
- O método **Init()** é responsável por:
  - Acessar o microfone do usuário utilizando [getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia);
  - Criar o [AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext);
  - Criar o [AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode);
- É possível passar um objeto por parâmetro com as seguintes propriedades:
  - **SampleRate:** altera a [sampleRate](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate) do AudioContext. Valor entre 8000Hz e 96000Hz;
  - **FFTSize:** altera o [fftSize](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize) do Analyser;
  - **SmoothingTimeConstant:** suavização do Analyser, alterando [smoothingTimeConstant](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant);
  - **Gain:** valor do [GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode).
  
``` js
const Init = await BeepListener.Init()
console.log(Init)
if (!Init.result) {
    this.RelatorioTeste.AddTesteFuncional("Microfone", "Falha na inicialização do microfone", -1, false)
    throw null
}
```

### Quais valores configurar no método Capture()?
Antes de configurar o método **Capture()**, é importante descobrir quais valores de frequência e amplitude utilizar. Isto pode ser feito através dos métodos **LeituraFrequenciaParaConfigurar()** e **DeterminaFrequenciaAmplitudeParaConfigurar()**.

#### LeituraFrequenciaParaConfigurar()
- Este método printa no console os valores de frequência lidos em um determinado tempo;
- Necessário passar por parâmetro um tempo de leitura e a quantidade de amostras;
- A partir dos valores obtidos, é possível ter uma base de qual frequência o beep do controlador tem.

``` js
BeepListener.LeituraFrequenciaParaConfigurar(2000, 40)
```

#### DeterminaFrequenciaAmplitudeParaConfigurar()
- Retorna os seguintes valores quando consegue detecar uma faixa dentro dos valores especificados de tempo e frequência:
  - Menor frequência e amplitude lidas;
  - Maior frequência e amplitude lidas;
  - Media da frequência e amplitude;
  - Todos os valores lidos de frequência e amplitude.
- Estes serão os valores base para configurar o método **Capture()** ;
- É possível passar um objeto como parâmetro, configurando principalmente as frequências e o tempo esperados.

``` js
const FreqAmpConfigs = await BeepListener.DeterminaFrequenciaAmplitudeParaConfigurar()
console.log(FreqAmpConfigs)
``` 

### Capture()
- Método responsável pela detecção do beep, validando tempo, frequência e amplitude;
- É possível passar um objeto como parâmetro com as seguintes propriedades:
  - **MinFreq:** Valor mínimo de frequência que as amostras devem ter;
  - **MaxFreq:** Valor máximo de frequência que as amostras devem ter;
  - **MinAmplitude:** Valor mínimo que a amplitude média deve ter;
  - **MaxAmplitude** Valor máximo que a amplitude média deve ter;
  - **TriggerMinAmp:** Amplitude mínima para ativar o trigger;
  - **TriggerMaxAmp:** Amplitude máxima para ativar o trigger;
  - **TempoDeAcionamento:** Tempo que o beep deve ficar acionado;
  - **PorcentagemAcionamentosValidos:** Usado para calcular quantas amostras devem ter os valores de frequência esperados dentro da faixa de acionamento do beep;
  - **TrackSize:** Tempo de aquisição de amostras pelo método **GetData()**;
  - **TrackSampleQuantity:** Quantidade de amostras que o método **GetData()** irá adquirir;
  - **TimeOut:** Tempo máximo que **Capture()** tentará detectar o beep.
- Retorna um objeto que informa se houve sucesso na detecção do beep.  

``` js
const Capture = await BeepListener.Capture()
if (Capture.result) {
    this.RelatorioTeste.AddTesteFuncional("Beep", Capture.msg, -1, true)
} else {
    this.RelatorioTeste.AddTesteFuncional("Beep", Capture.msg, -1, false)
    throw null
}
```