import RelatorioTeste from "../rast-pvi/relatorio-teste.js"
import Log from "../script-loader/utils-script.js"

/**
 * Classe que faz a manipulação dos dados obtidos pelo microfone, permitindo a validação do beep dos controladores
 * # Exemplos
 * ```js
    import BeepListener from "../node_modules/@libs-scripts-mep/beep-listener/beep-listener.js"
 * ```
 */
export default class BeepListener {

    /** 
     * Instância do [AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) do BeepListener
     * @type AudioContext
     */
    static AudioContext

    /**
     * [AudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioSourceNode) utilizado pelo AudioContext,
     * é a fonte de áudio(microfone) que fornece os dados para ele.
     * @type MediaStreamAudioSourceNode
     */
    static AudioSourceNode

    /**
     * Instância do [AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) do BeepListener
     * @type AnalyserNode
     */
    static Analyser

    /**
     * [GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode) do BeepListener
     * @type GainNode
     */
    static Gain

    /**
     * Usado para descobrir em qual posição do array está a amplitude da frequência desejada
     * @type Number
     */
    static HertzPorDivisao

    /**
     * Armazena a última faixa lida, permite retornar algo quando a faixa esperada não é detectada
     * @type Object
     */
    static LastRead

    /**
     * Indica se uma faixa na frequência esperada foi encontrada, permite diferenciar quando a falha ocorreu por frequência ou amplitude
     * @type Boolean
     */
    static EncontrouTrackFrequencia

    //#region DeviceIds

    /** Localiza o ID de um dispositivo baseado no filtro passado */
    static async FindDeviceId(DeviceFilter) {
        const DeviceList = await navigator.mediaDevices.enumerateDevices()
        const Device = DeviceList.find(DeviceFilter)
        if (Device != undefined) {
            return Device.deviceId
        } else {
            return undefined
        }
    }

    /**
     * Webcam Logitech C930e
     * 
     * ![Image](https://i.imgur.com/9YnqdVk.png)
     */
    static async C930e() {
        const filter = device => device.kind == "audioinput" && device.label.includes("C930e") && !device.deviceId.includes("communications") && !device.deviceId.includes("default")
        return await this.FindDeviceId(filter)
    }

    /**
     * Microfone de lapela USB HS-29
     * 
     * ![Image](https://i.imgur.com/DffAe6i.png)
     */
    static async HS_29() {
        const filter = device => device.kind == "audioinput" && device.label.includes("AB13X") && !device.deviceId.includes("communications") && !device.deviceId.includes("default")
        return await this.FindDeviceId(filter)
    }

    //#endregion DeviceIds


    /**
     * Detecta o microfone utilizando [getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
     * @param {string | undefined} deviceId
     * @returns microfone detectado ou erro
     */
    static async GetAudioDevice(deviceId) {
        const AudioDevice = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, deviceId, noiseSuppression: false } })
            .then(Device => {
                return { result: true, device: Device }
            })
            .catch(Error => {
                console.error(Error)
                return { result: false, error: Error }
            })

        return AudioDevice
    }

    /**
     * 
     * @param {MediaStream} AudioDevice Microfone
     * @param {object} ParamObj Objeto com configurações para o AudioContext
     */
    static CreateAudioContext(AudioDevice, ParamObj) {
        this.AudioContext = new AudioContext({ sampleRate: ParamObj.SampleRate, latencyHint: "interactive" })
        this.AudioSourceNode = this.AudioContext.createMediaStreamSource(AudioDevice)
    }

    /** Suspende o processamento do AudioContext */
    static async SuspendAudioContext() {
        await this.AudioContext.suspend()
    }

    /** Retoma o processamento do AudioContext */
    static async ResumeAudioContext() {
        await this.AudioContext.resume()
    }

    /**
     * 
     * @param {object} ParamObj Objeto com configurações para o Analyser e Gain
     */
    static CreateAnalyser(ParamObj) {
        this.Analyser = this.AudioContext.createAnalyser()
        this.Analyser.fftSize = ParamObj.FFTSize
        this.Analyser.smoothingTimeConstant = ParamObj.SmoothingTimeConstant

        this.Gain = this.AudioContext.createGain()
        this.Gain.gain.value = ParamObj.Gain

        this.AudioSourceNode.connect(this.Gain)
        this.Gain.connect(this.Analyser)
        // this.Analyser.connect(this.AudioContext.destination) //Descomentar para jogar o som lido pelo microfone no alto-falante.
    }


    /**
     *  
     * @param {number} TempoMonitoramento Tempo em que serão obtidas as amostras de frequência e amplitude
     * @param {boolean} SampleForTrigger Se true, será obtida apenas uma amostra de frequência e amplitude para utilizar como trigger
     * @returns objeto com os arrays de frequência e amplitude
     * 
     */
    static async GetData(TempoMonitoramento, SampleForTrigger = false) {
        let FrequencyDataBuffer = []
        let AmplitudeBuffer = []

        let LoopControl = true

        if (!SampleForTrigger) {
            this.AsyncDelay(TempoMonitoramento)
                .then(() => { LoopControl = false })
        }

        while (LoopControl) {
            const Signal = this.Freq()
            const Frequencia = this.Pitch(Signal.timeDomain)
            FrequencyDataBuffer.push(Frequencia)

            const Amplitude = this.LocalizaAmplitude(Frequencia, Signal.frequencia)
            AmplitudeBuffer.push(Amplitude)

            await this.AsyncDelay(0) // Precisa disto para não travar o navegador

            if (SampleForTrigger) { break }
        }

        const FinalData = this.FixValues(FrequencyDataBuffer, AmplitudeBuffer)

        return ({ frequencia: FinalData.frequencia, amplitude: FinalData.amplitude })
    }

    /**
     * Permite extrair do TimeDomainArray o valor da frequência 
     * @param {Float32Array} TimeDomainArray array do TimeDomain
     * @returns {number} valor de frequência
     */
    static Pitch(TimeDomainArray) {
        let maximaCount = 0
        let CorrolatedSignal = new Float32Array(this.Analyser.fftSize)
        let LocalMaxima = new Array(10)

        for (let l = 0; l < this.Analyser.fftSize; l++) {
            CorrolatedSignal[l] = 0
            for (let i = 0; i < this.Analyser.fftSize - l; i++) {
                CorrolatedSignal[l] += TimeDomainArray[i] * TimeDomainArray[i + l]
            }
            if (l > 1) {
                if ((CorrolatedSignal[l - 2] - CorrolatedSignal[l - 1]) < 0
                    && (CorrolatedSignal[l - 1] - CorrolatedSignal[l]) > 0) {
                    LocalMaxima[maximaCount] = (l - 1)
                    maximaCount++
                    if ((maximaCount >= LocalMaxima.length))
                        break
                }
            }
        }

        let maximaMean = LocalMaxima[0]

        for (let i = 1; i < maximaCount; i++)
            maximaMean += LocalMaxima[i] - LocalMaxima[i - 1]

        maximaMean /= maximaCount

        return this.AudioContext.sampleRate / maximaMean
    }


    static AsyncDelay(timeout) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(false)
            }, timeout)
        })
    }

    /**
     * Arredonda os valores dos arrays para no máximo duas casas decimais
     * @param {Array} FreqBuffer array da frequência
     * @param {Array} AmpBuffer array da amplitude
     * @returns arrays com valores arredondados
     */
    static FixValues(FreqBuffer, AmpBuffer) {
        fix(FreqBuffer)
        fix(AmpBuffer)

        return { frequencia: FreqBuffer, amplitude: AmpBuffer }

        /**
         * @param {Array} buffer 
         */
        function fix(buffer) {
            buffer.forEach((value, index, array) => {
                if (value % 1 != 0 && !isNaN(value)) {
                    array[index] = parseFloat(array[index].toFixed(2))
                }
            })
        }
    }

    /**
     * Obtém e retorna arrays com frequência e amplitude, usando
     * [getFloatTimeDomainData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) e
     * [getFloatFrequencyData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatFrequencyData)
     * @returns objeto com os arrays de frequency e time domain
     */
    static Freq() {
        let FrequencyDataArray = new Float32Array(this.Analyser.fftSize)
        let TimeDomainDataArray = new Float32Array(this.Analyser.fftSize)

        this.Analyser.getFloatTimeDomainData(TimeDomainDataArray)
        this.Analyser.getFloatFrequencyData(FrequencyDataArray)
        return {
            timeDomain: TimeDomainDataArray,
            frequencia: FrequencyDataArray
        }
    }


    /**
     * 
     * @param {number} Frequencia frequência de referência
     * @param {Float32Array} AmplitudeArray array do domínio da frequência
     * @returns {number} valor de amplitude referente à frequência passada
     */
    static LocalizaAmplitude(Frequencia, AmplitudeArray) {
        let PosicaoArray = Math.round(Frequencia / this.HertzPorDivisao)
        return AmplitudeArray[PosicaoArray]
    }

    /**
     * Verifica a frequência a cada 50ms e retorna caso ela esteja dentro dos valores de frequência e, opcionalmente, de amplitude
     * @param {object} ConfigObj objeto com os valores para fazer a detecção do trigger
     */
    static async TriggerFrequencyDetector(ConfigObj) {
        if (this.AudioContext.state == "running") {

            const Sample = await this.GetData(0, true)
            await this.AsyncDelay(50)
            if (Sample.frequencia[0] >= ConfigObj.MinFreq && Sample.frequencia[0] <= ConfigObj.MaxFreq) {
                if (ConfigObj.AmplitudeValidation) {
                    if (Sample.amplitude[0] >= ConfigObj.MinAmplitude && Sample.amplitude[0] <= ConfigObj.MaxAmplitude) {
                        return
                    } else {
                        return (this.TriggerFrequencyDetector(ConfigObj))
                    }
                } else {
                    return
                }
            } else {
                return (this.TriggerFrequencyDetector(ConfigObj))
            }
        } else {
            return
        }
    }

    /**
     * Valida se a track passada está dentro dos valores de frequência e amplitude
     * @param {object} Track objeto com os arrays de frequência e amplitude
     * @param {object} ConfigObj objeto com os valores de frequência
     * @returns objeto com o resultado da validação e valores lidos
     */
    static TrackValidator(Track, ConfigObj) {

        const ValidaPorcentagem = this.ValidaPorcentagemAcionamentos(Track.frequencia, ConfigObj)
        if (!ValidaPorcentagem) return { result: false }
        this.EncontrouTrackFrequencia = true

        const filteredTrack = this.TrackFilter(Track, ConfigObj)
        const media = this.CalculaMediaFreqAmp(filteredTrack.frequencia, filteredTrack.amplitude)

        if (ConfigObj.AmplitudeValidation) {
            if (!(media.amplitude >= ConfigObj.MinAmplitude && media.amplitude <= ConfigObj.MaxAmplitude)) {
                return { result: false }
            }
        }

        return {
            result: true,
            frequencia: filteredTrack.frequencia,
            frequenciaMedia: media.frequencia,
            amplitude: filteredTrack.amplitude,
            amplitudeMedia: media.amplitude
        }
    }


    /**
     * @param {{frequencia: array, amplitude: array}} Track 
     * @param {object} ConfigObj 
     * @returns 
     */
    static TrackFilter(Track, ConfigObj) {
        const amplitudeArray = []
        const frequencyArray = Track.frequencia.filter((value, index) => {
            if (value >= ConfigObj.MinFreq && value <= ConfigObj.MaxFreq) {
                amplitudeArray.push(Track.amplitude[index])
                return true
            }

            return false
        })

        return { frequencia: frequencyArray, amplitude: amplitudeArray }
    }

    /**
     * Calcula a média da frequência e amplitude.
     * @param {array} freqTrack array da frequência
     * @param {array} ampTrack array da amplitude
     * @returns médias de frequência e amplitude
     */
    static CalculaMediaFreqAmp(freqTrack, ampTrack) {
        return {
            frequencia: freqTrack.reduce((accumulator, currentValue) => accumulator + currentValue) / freqTrack.length,
            amplitude: ampTrack.sort((a, b) => a - b)[Math.round(ampTrack.length / 2)]
        }
    }

    /**
     * Verifica se o array possui a quantidade mínima de acionamentos válidos.
     * Por exemplo, em um array com 100 valores e 70% de aceitação, pelo menos 70 destes valores devem estar dentro do range mínimo e máximo da frequência.
     * @param {Array} Track array com os valores de frequência lidos
     * @param {object} ConfigObj objeto com os valores de frequência e porcentagem de aceitação
     * @returns {boolean}
     */
    static ValidaPorcentagemAcionamentos(Track, ConfigObj) {
        const AmostrasParaTrackValida = Track.length * (ConfigObj.PorcentagemAcionamentosValidos / 100)

        const filteredArray = Track.filter(frequencia => frequencia >= ConfigObj.MinFreq && frequencia <= ConfigObj.MaxFreq)

        return filteredArray.length >= AmostrasParaTrackValida
    }

    /**
     * Método que aguarda um acionamento do trigger para capturar e validar uma track, retornando a mesma caso ela seja válida.
     * @param {object} ConfigObj objeto com os valores usados para a validação
     * @returns {object}
     */
    static async TrackCapture(ConfigObj) {
        await this.TriggerFrequencyDetector(ConfigObj)

        if (this.AudioContext.state == "running") {
            const Track = await this.GetData(ConfigObj.TrackSize)

            this.LastRead = Track

            const ValidatedTrack = this.TrackValidator(Track, ConfigObj)
            if (ValidatedTrack.result) {
                return ValidatedTrack
            } else {
                return this.TrackCapture(ConfigObj)
            }
        } else {
            return
        }
    }

    /**
     * @param {object} ParamObj 
     * @returns  RelatorioTeste
     * ---
     * # Init()
     * Inicializa o microfone e cria as instâncias do AudioContext e AnalyserNode.
     * 
     * ---
     * ## ParamObj (opcional)
     * ``` js
        ParamObj = {
            SampleRate: number, // Opcional, valor entre 8000 e 96000
            FFTSize: number, //Opcional, valor deve ser potência de 2, entre 2^5 e 2^15
            SmoothingTimeConstant: number, //Opcional, valor entre 0 e 1
            Gain: number, //Opcional
            DeviceId: string | undefined
        }
     * ```
     * ---
     * 
     * ## Retorno
     * ``` js
        return RelatorioTeste
     * ```
     * ---
     * 
     * ## Exemplo
     * ``` js
        const TestReport = new RelatorioTeste()
     
        const InitBeep = await BeepListener.Init().catch((relatorio) => { return relatorio })
        if (RastUtil.evalReport(InitBeep) == false) {
            RastUtil.transferReport([InitBeep], TestReport) 
            return 
        }
     * ```
     */
    static async Init(ParamObj = {}) {
        ParamObj.SampleRate ??= 48000
        ParamObj.FFTSize ??= 2048
        ParamObj.SmoothingTimeConstant ??= 0.8
        ParamObj.Gain ??= 1
        ParamObj.DeviceId ??= undefined

        const Relatorio = new RelatorioTeste()

        if (!await CheckValues()) {
            Relatorio.AddTesteFuncional("InitBeep", "Valores de configuração inválidos", -1, false)
            return Promise.reject(Relatorio)
        }

        const GetDevice = await this.GetAudioDevice(ParamObj.DeviceId)

        if (GetDevice.result) {
            this.CreateAudioContext(GetDevice.device, ParamObj)
            this.CreateAnalyser(ParamObj)
            await this.SuspendAudioContext()

            this.HertzPorDivisao = ParamObj.SampleRate / ParamObj.FFTSize

            Log.console(`AudioContext latency -> ${this.AudioContext.baseLatency * 1000}ms`, Log.Colors.Green.Cyan)

            Relatorio.AddTesteFuncional("InitMicrofone", "Inicialização do microfone concluída com sucesso", -1, true)
            return Relatorio
        } else {
            Relatorio.AddTesteFuncional("InitMicrofone", "Falha na inicialização do microfone", -1, false)
            return Promise.reject(Relatorio)
        }

        async function CheckValues() {
            const TypeCheck = await Promise.all([
                BeepListener.CheckType("SampleRate", ParamObj.SampleRate, "number"),
                BeepListener.CheckType("FFTSize", ParamObj.FFTSize, "number"),
                BeepListener.CheckType("SmoothingTimeConstant", ParamObj.SmoothingTimeConstant, "number"),
                BeepListener.CheckType("Gain", ParamObj.Gain, "number")
            ])

            for (const result of TypeCheck) {
                if (!result) { return false }
            }

            const RangeCheck = await Promise.all([
                BeepListener.CheckRange("SampleRate", ParamObj.SampleRate, 8000, 96000),
                BeepListener.CheckRange("FFTSize", ParamObj.FFTSize, 32, 32768),
                BeepListener.CheckRange("SmoothingTimeConstant", ParamObj.SmoothingTimeConstant, 0, 1)
            ])

            for (const result of RangeCheck) {
                if (!result) { return false }
            }

            if (!Number.isInteger(Math.log(ParamObj.FFTSize) / Math.log(2))) {
                console.error("O valor de FFTSize não é uma potência de 2")
                return false
            }

            return true
        }
    }

    /**
     * 
     * @param {object} ConfigObj objeto com configurações para realizar a captura do beep
     * @returns objeto com o relatório e os valores lidos
     * ---
     * # Capture()
     * Detecta uma faixa com os valores de frequência, amplitude e tempo especificados.
     * 
     * Usado para validar o acionamento do beep dos controladores.
     * 
     * ---
     * ## ConfigObj(opcional)
     * ``` js
        ConfigObj = {
            MinFreq: number,
            MaxFreq: number,
            AmplitudeValidation: boolean,
            MinAmplitude: number,
            MaxAmplitude: number,
            PorcentagemAcionamentosValidos: number,
            TrackSize: number,
            TimeOut: number
        }
     * ```
     * ---
     * ## Retorno
     * ``` js
        return RelatorioTeste
     * ```
     * ---
     * ## Exemplo
     * ``` js
        const TestReport = new RelatorioTeste()

        const BeepCapture = await BeepListener.Capture().catch((relatorio) => { return relatorio })
     
        RastUtil.transferReport([BeepCapture], TestReport)
        if (RastUtil.evalReport(TestReport) == false) { return }
     * ```
     */
    static async Capture(ConfigObj = {}) {
        ConfigObj.MinFreq ??= 2950
        ConfigObj.MaxFreq ??= 3050

        ConfigObj.AmplitudeValidation ??= true
        ConfigObj.MinAmplitude ??= -30
        ConfigObj.MaxAmplitude ??= -20

        ConfigObj.PorcentagemAcionamentosValidos ??= 70
        ConfigObj.TrackSize ??= 500
        ConfigObj.TimeOut ??= 10000

        const Relatorio = new RelatorioTeste()

        if (!await CheckValues()) {
            Relatorio.AddTesteFuncional("Capture", "Valores de cofiguração inválidos", -1, false)
            return Promise.reject(Relatorio)
        }

        this.LastRead = {}

        await this.ResumeAudioContext()

        const Capture = await Promise.race([this.TrackCapture(ConfigObj), this.AsyncDelay(ConfigObj.TimeOut)])

        await this.SuspendAudioContext()

        if (!Capture) {

            if (this.EncontrouTrackFrequencia) {
                this.EncontrouTrackFrequencia = false

                console.log({ frequencia: this.LastRead.frequencia, amplitude: this.LastRead.amplitude })

                Relatorio.AddTesteFuncional("Beep", "Foi detectada uma faixa na frequência esperada, mas fora da amplitude desejada", -1, false)
                return Promise.reject(Relatorio)

            } else {
                console.log({ frequencia: this.LastRead.frequencia, amplitude: this.LastRead.amplitude })

                Relatorio.AddTesteFuncional("Beep", "Nenhuma faixa detectada na frequência esperada", -1, false)
                return Promise.reject(Relatorio)
            }
        } else {
            this.EncontrouTrackFrequencia = false

            console.log({
                frequencia: {
                    valores: Capture.frequencia,
                    frequenciaMedia: Capture.frequenciaMedia
                },
                amplitude: {
                    valores: Capture.amplitude,
                    amplitudeMedia: Capture.amplitudeMedia
                }
            })

            Relatorio.AddTesteFuncional("Beep", "Faixa detectada dentro dos valores esperados", -1, true)
            return Relatorio
        }


        async function CheckValues() {
            const TypeCheck = await Promise.all([
                BeepListener.CheckType("MinFreq", ConfigObj.MinFreq, "number"),
                BeepListener.CheckType("MaxFreq", ConfigObj.MaxFreq, "number"),
                BeepListener.CheckType("AmplitudeValidation", ConfigObj.AmplitudeValidation, "boolean"),
                BeepListener.CheckType("MinAmplitude", ConfigObj.MinAmplitude, "number"),
                BeepListener.CheckType("MaxAmplitude", ConfigObj.MaxAmplitude, "number"),
                BeepListener.CheckType("PorcentagemAcionamentosValidos", ConfigObj.PorcentagemAcionamentosValidos, "number"),
                BeepListener.CheckType("TrackSize", ConfigObj.TrackSize, "number"),
                BeepListener.CheckType("TimeOut", ConfigObj.TimeOut, "number"),
            ])

            for (const result of TypeCheck) {
                if (!result) { return false }
            }

            const RangeCheck = await Promise.all([
                BeepListener.CheckRange("MinFreq", ConfigObj.MinFreq, 0, Infinity),
                BeepListener.CheckRange("MaxFreq", ConfigObj.MaxFreq, 0, Infinity),
                BeepListener.CheckRange("PorcentagemAcionamentosValidos", ConfigObj.PorcentagemAcionamentosValidos, 0, 100),
                BeepListener.CheckRange("TrackSize", ConfigObj.TrackSize, 0, Infinity),
                BeepListener.CheckRange("TimeOut", ConfigObj.TimeOut, 0, Infinity),
            ])

            for (const result of RangeCheck) {
                if (!result) { return false }
            }

            const ScaleCheck = await Promise.all([
                BeepListener.CheckScale("MinFreq", "MaxFreq", ConfigObj.MinFreq, ConfigObj.MaxFreq),
                BeepListener.CheckScale("MinAmplitude", "MaxAmplitude", ConfigObj.MinAmplitude, ConfigObj.MaxAmplitude)
            ])

            for (const result of ScaleCheck) {
                if (!result) { return false }
            }

            return true
        }
    }

    /**
     * 
     * @param {number} TempoTotalLeitura tempo em que serão pegas as amostras de frequência
     * @returns array com os valores de frequência
     * ---
     * # FrequencyReader()
     * Retorna um array com os valores de frequência lidos no tempo que foi passado.
     * 
     * Usado para descobrir qual frequência deve ser usada no método ConfigDeterminator.
     * 
     * ---
     * ## Exemplo
     * ``` js
        console.log(await BeepListener.FrequencyReader(2000))
     * ```
     */
    static async FrequencyReader(TempoTotalLeitura) {
        await this.ResumeAudioContext()

        const Track = await this.GetData(TempoTotalLeitura)

        await this.SuspendAudioContext()
        return Track.frequencia
    }

    /**
     * 
     * @param {object} ConfigObj objeto com configurações para detecção da faixa
     * @returns objeto com informações da frequência e amplitude
     * ---
     * # ConfigDeterminator
     * Detecta e retorna uma faixa na frequência especificada.
     * 
     * Utilizado para determinar os valores de frequência, amplitude e tempo que devem ser usados no método Capture.
     * 
     * ---
     * ## ConfigObj(opcional)
     * ``` js
        ConfigObj = {
            MinFreq: number,
            MaxFreq: number,
            PorcentagemAcionamentosValidos: number,
            TrackSize: number
        } 
     * ```
     * ---
     * ## Retorno
     * ``` js
        return {
        frequencia: {
                min: number,
                max: number,
                media: number,
                valores: Array
            },
            amplitude: {
                min: number,
                max: number,
                media: number,
                valores: Array
            }
        }
     * ```   
     * ---
     * ## Exemplo
     * ``` js
        console.log(await BeepListener.ConfigDeterminator())
     * ```
     */
    static async ConfigDeterminator(ConfigObj = {}) {
        ConfigObj.MinFreq ??= 2950
        ConfigObj.MaxFreq ??= 3050
        ConfigObj.PorcentagemAcionamentosValidos ??= 70
        ConfigObj.TrackSize ??= 500

        ConfigObj.AmplitudeValidation = false

        if (!await CheckValues()) {
            return "Valores de configuração são inválidos"
        }

        await this.ResumeAudioContext()

        await this.TriggerFrequencyDetector(ConfigObj)
        const Track = await this.GetData(ConfigObj.TrackSize)

        const ValidatedTrack = this.TrackValidator(Track, ConfigObj)

        if (ValidatedTrack.result) {
            await this.SuspendAudioContext()

            return {
                frequencia: {
                    min: Math.min(...ValidatedTrack.frequencia),
                    max: Math.max(...ValidatedTrack.frequencia),
                    media: ValidatedTrack.frequenciaMedia,
                    valores: ValidatedTrack.frequencia
                },
                amplitude: {
                    min: Math.min(...ValidatedTrack.amplitude),
                    max: Math.max(...ValidatedTrack.amplitude),
                    media: ValidatedTrack.amplitudeMedia,
                    valores: ValidatedTrack.amplitude
                }
            }

        } else {
            return this.ConfigDeterminator(ConfigObj)
        }


        async function CheckValues() {
            const TypeCheck = await Promise.all([
                BeepListener.CheckType("MinFreq", ConfigObj.MinFreq, "number"),
                BeepListener.CheckType("MaxFreq", ConfigObj.MaxFreq, "number"),
                BeepListener.CheckType("PorcentagemAcionamentosValidos", ConfigObj.PorcentagemAcionamentosValidos, "number"),
                BeepListener.CheckType("TrackSize", ConfigObj.TrackSize, "number")
            ])

            for (const result of TypeCheck) {
                if (!result) { return false }
            }

            const RangeCheck = await Promise.all([
                BeepListener.CheckRange("MinFreq", ConfigObj.MinFreq, 0, Infinity),
                BeepListener.CheckRange("MaxFreq", ConfigObj.MaxFreq, 0, Infinity),
                BeepListener.CheckRange("PorcentagemAcionamentosValidos", ConfigObj.PorcentagemAcionamentosValidos, 0, 100),
                BeepListener.CheckRange("TrackSize", ConfigObj.TrackSize, 0, Infinity)
            ])

            for (const result of RangeCheck) {
                if (!result) { return false }
            }

            if (!BeepListener.CheckScale("MinFreq", "MaxFreq", ConfigObj.MinFreq, ConfigObj.MaxFreq)) { return false }

            return true
        }
    }

    /**
     * Usado para validar se os parâmetros passados nos métodos são do tipo esperado
     * @param {string} Name nome do parâmetro
     * @param {number} Value valor do parâmetro
     * @param {string} ExpectedType tipo que o parâmetro deve ser
     * @returns true se o parâmetro for do tipo esperado, false se não for
     */
    static CheckType(Name, Value, ExpectedType) {
        if (typeof Value == ExpectedType) {
            return true
        } else {
            console.error(`${Name} não é do tipo ${ExpectedType}`)
            return false
        }
    }

    /**
     * Usado para validar se os parâmetros passados nos métodos estão dentro do range esperado
     * @param {string} Name nome do parâmetro
     * @param {number} Value valor do parâmetro
     * @param {number} MinValue valor mínimo que o parâmetro deve ter
     * @param {number} MaxValue valor máximo que o parâmetro deve ter
     * @returns true se o valor estiver dentro do range, false se não estiver
     */
    static CheckRange(Name, Value, MinValue, MaxValue) {
        if (Value >= MinValue && Value <= MaxValue) {
            return true
        } else {
            console.error(`${Name} está fora do range [${MinValue} - ${MaxValue}]`)
            return false
        }
    }

    /**
     * Usado para verificar se a escala formada por dois parâmetros é valida,
     * ou seja, para evitar que o valor mínimo seja maior que o valor máximo
     * @param {string} MinValueName nome do parâmetro que indica o valor mínimo
     * @param {string} MaxValueName nome do parâmetro que indica o valor máximo
     * @param {number} MinValue valor do parâmetro que indica o valor mínimo
     * @param {number} MaxValue valor do parâmetro que indica o valor máximo
     * @returns true caso seja uma escala válida, false se não for
     */
    static CheckScale(MinValueName, MaxValueName, MinValue, MaxValue) {
        if (MinValue <= MaxValue) {
            return true
        } else {
            console.error(`Escala inválida, ${MinValueName} é maior que ${MaxValueName}`)
            return false
        }
    }

    static { window.BeepListener = this }

}