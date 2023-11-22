# beep-listener
- [beep-listener](#beep-listener)
  - [Instalando](#instalando)
  - [Desinstalando](#desinstalando)
  - [Atualizando](#atualizando)
  - [Como utilizar](#como-utilizar)
  - [Driver de Áudio](#driver-de-áudio)

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

Realize a importação:

```js
import BeepListener from "../node_modules/@libs-scripts-mep/beep-listener/beep-listener.js"
```

Os métodos que serão utilizados no script são `Init()` e `Capture()`. `FrequencyReader()` e `ConfigDeterminator()` servem para configurar o `Capture()`.
<br>
Informações detalhadas estão disponíveis via `JSDocs`.

## Driver de Áudio

É necessário baixar o [MaxxAudio Pro](https://www.dell.com/support/home/pt-br/drivers/driversdetails?driverid=mt7ff), um pacote com drivers de áudio e um aplicativo que melhora o processamento. Os drivers são importantes para tornar a leitura dos valores pelo microfone mais consistente, porém o aplicativo é um problema, pois ele faz um pós-processamento do áudio, alterando o tempo todo e automaticamente os valores lidos, o que impede a execução adequada no script.

Para impedir que isto aconteça, é necessário desabilitar a inicialização deste aplicativo junto com o sistema. Para fazer isto, basta seguir os seguintes passos:

**Gerenciador de Tarefas > Aplicativos de inicialização > Clicar com o botão direito sobre o aplicativo Waves > Clicar em Desabilitar**

![Image](https://i.imgur.com/3UNcznY.png)