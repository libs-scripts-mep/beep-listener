import Log from "../script-loader/utils-script.js"

/**
 * Classe que faz a manipulação dos dados obtidos pelo microfone, permitindo a validação do beep dos controladores
 * @example
 * import BeepListener from "../node_modules/@libs-scripts-mep/beep-listener/beep-listener.js"
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
    static GainNode

    /**
     * Usado para descobrir em qual posição do array está a amplitude da frequência desejada
     * @type number
     */
    static hertzPerDivision

    /**
     * Armazena a última faixa lida, permite retornar algo quando a faixa esperada não é detectada
     * @type Object
     */
    static lastRead

    /**
     * Indica se uma faixa na frequência esperada foi encontrada, permite diferenciar quando a falha ocorreu por frequência ou amplitude
     * @type boolean
     */
    static EncontrouTrackFrequencia

    //#region DeviceIds

    /** Localiza o ID de um dispositivo baseado no filtro passado */
    static async findDeviceId(deviceFilter) {
        const DeviceList = await navigator.mediaDevices.enumerateDevices()
        const Device = DeviceList.find(deviceFilter)
        if (Device) { return Device.deviceId }
    }

    /**
     * Webcam Logitech C930e
     * 
     * ![Image](https://i.imgur.com/9YnqdVk.png)
     */
    static async C930e() {
        const filter = device => device.kind == "audioinput" && device.label.includes("C930e") && !device.deviceId.includes("communications") && !device.deviceId.includes("default")
        return await this.findDeviceId(filter)
    }

    /**
     * Microfone de lapela USB HS-29
     * 
     * ![Image](https://i.imgur.com/DffAe6i.png)
     */
    static async HS_29() {
        const filter = device => device.kind == "audioinput" && device.label.includes("AB13X") && !device.deviceId.includes("communications") && !device.deviceId.includes("default")
        return await this.findDeviceId(filter)
    }
    //#endregion DeviceIds

    /**
     * Detecta o microfone utilizando [getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
     * @param {string} [deviceId] ID do microfone
     * @returns microfone detectado ou erro
     */
    static async getAudioDevice(deviceId) {
        const audioDevice = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, deviceId, noiseSuppression: false } })
            .then(device => {
                return { result: true, device }
            })
            .catch(error => {
                console.error(error)
                return { result: false, error }
            })

        return audioDevice
    }

    /**
     * Inicializa o AudioContext e cria a instância do AudioSourceNode
     * @param {MediaStream} audioDevice Microfone
     * @param {number} sampleRate Taxa de amostragem
     */
    static createAudioContext(audioDevice, sampleRate) {
        this.AudioContext = new AudioContext({ sampleRate, latencyHint: "interactive" })
        this.AudioSourceNode = this.AudioContext.createMediaStreamSource(audioDevice)
    }

    /**
     * Inicializa e conecta as instâncias do Analyser e Gain com o AudioSourceNode
     * @param {number} fftSize
     * @param {number} smoothingTimeConstant
     * @param {number} gain
     */
    static createAnalyser(fftSize, smoothingTimeConstant, gain) {
        this.Analyser = this.AudioContext.createAnalyser()
        this.Analyser.fftSize = fftSize
        this.Analyser.smoothingTimeConstant = smoothingTimeConstant

        this.GainNode = this.AudioContext.createGain()
        this.GainNode.gain.value = gain

        this.AudioSourceNode.connect(this.GainNode)
        this.GainNode.connect(this.Analyser)
        // this.Analyser.connect(this.AudioContext.destination) //Descomentar para jogar o som lido pelo microfone no alto-falante.
    }


    /**
     *  
     * @param {number} time Tempo em que serão obtidas as amostras de frequência e amplitude
     * @param {boolean} [triggerSample] Se true, será obtida apenas uma amostra de frequência e amplitude para utilizar como trigger
     * @returns objeto com os arrays de frequência e amplitude
     * 
     */
    static async getData(time, triggerSample = false) {
        /**@type {number[]} */
        const frequencyDataBuffer = []
        /**@type {number[]} */
        const amplitudeBuffer = []

        let loopControl = true

        if (!triggerSample) { this.delay(time).then(() => { loopControl = false }) }

        while (loopControl) {
            const signal = this.freq()
            const frequencia = this.pitch(signal.timeDomain)
            frequencyDataBuffer.push(frequencia)

            const amplitude = this.findAmplitude(frequencia, signal.frequencia)
            amplitudeBuffer.push(amplitude)

            await this.delay(0) // Precisa disto para não travar o navegador

            if (triggerSample) { break }
        }

        const finalData = this.fixValues(frequencyDataBuffer, amplitudeBuffer)

        return { frequencia: finalData.frequencia, amplitude: finalData.amplitude }
    }

    /**
     * Permite extrair do TimeDomainArray o valor da frequência 
     * @param {Float32Array} timeDomainArray array do TimeDomain
     * @returns {number} valor de frequência
     */
    static pitch(timeDomainArray) {
        let maximaCount = 0
        let corrolatedSignal = new Float32Array(this.Analyser.fftSize)
        let localMaxima = new Array(10)

        for (let l = 0; l < this.Analyser.fftSize; l++) {
            corrolatedSignal[l] = 0
            for (let i = 0; i < this.Analyser.fftSize - l; i++) {
                corrolatedSignal[l] += timeDomainArray[i] * timeDomainArray[i + l]
            }
            if (l > 1) {
                if ((corrolatedSignal[l - 2] - corrolatedSignal[l - 1]) < 0
                    && (corrolatedSignal[l - 1] - corrolatedSignal[l]) > 0) {
                    localMaxima[maximaCount] = (l - 1)
                    maximaCount++
                    if ((maximaCount >= localMaxima.length))
                        break
                }
            }
        }

        let maximaMean = localMaxima[0]

        for (let i = 1; i < maximaCount; i++)
            maximaMean += localMaxima[i] - localMaxima[i - 1]

        maximaMean /= maximaCount

        return this.AudioContext.sampleRate / maximaMean
    }


    /**
     * Returns a promise that resolves after a specified timeout.
     * @param {number} timeout - The number of milliseconds to delay.
     * @returns {Promise<void>} A promise that resolves after the specified timeout.
     */
    static delay(timeout) { return new Promise(resolve => setTimeout(resolve, timeout)) }

    /**
     * Arredonda os valores dos arrays para no máximo duas casas decimais
     * @param {number[]} FreqBuffer array da frequência
     * @param {number[]} AmpBuffer array da amplitude
     * @returns arrays com valores arredondados
     */
    static fixValues(FreqBuffer, AmpBuffer) {
        return { frequencia: fix(FreqBuffer), amplitude: fix(AmpBuffer) }

        /**
         * @param {number[]} buffer
         */
        function fix(buffer) {
            return buffer.map(value => {
                if (!isNaN(value) && !Number.isInteger(value)) { return parseFloat(value.toFixed(2)) }
                return value
            })
        }
    }

    /**
     * Obtém e retorna arrays com frequência e amplitude, usando
     * [getFloatTimeDomainData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) e
     * [getFloatFrequencyData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatFrequencyData)
     * @returns objeto com os arrays de frequency e time domain
     */
    static freq() {
        const frequencyDataArray = new Float32Array(this.Analyser.fftSize)
        const timeDomainDataArray = new Float32Array(this.Analyser.fftSize)

        this.Analyser.getFloatTimeDomainData(timeDomainDataArray)
        this.Analyser.getFloatFrequencyData(frequencyDataArray)

        return { timeDomain: timeDomainDataArray, frequencia: frequencyDataArray }
    }


    /**
     * 
     * @param {number} frequency frequência de referência
     * @param {Float32Array} amplitudeArray array do domínio da frequência
     * @returns {number} valor de amplitude referente à frequência passada
     */
    static findAmplitude(frequency, amplitudeArray) { return amplitudeArray[Math.round(frequency / this.hertzPerDivision)] }

    /**
     * Verifica a frequência a cada 50ms e retorna caso ela esteja dentro dos valores de frequência e, opcionalmente, de amplitude
     * @param {object} ConfigObj objeto com os valores para fazer a detecção do trigger
     */
    static async frequencyTrigger(ConfigObj) {
        while (this.AudioContext.state == "running") {
            const sample = await this.getData(0, true)

            if (sample.frequencia[0] >= ConfigObj.MinFreq && sample.frequencia[0] <= ConfigObj.MaxFreq) {
                if (ConfigObj.AmplitudeValidation) {
                    if (sample.amplitude[0] >= ConfigObj.MinAmplitude && sample.amplitude[0] <= ConfigObj.MaxAmplitude) { return }
                } else { return }
            }

            await this.delay(50)
        }
    }

    /**
     * Valida se a track passada está dentro dos valores de frequência e amplitude
     * @param {object} track objeto com os arrays de frequência e amplitude
     * @param {object} ConfigObj objeto com os valores de frequência
     * @returns {{result: boolean, frequencia?: number[], frequenciaMedia?: number, amplitude?: number[], amplitudeMedia?: number}}
     */
    static trackValidator(track, ConfigObj) {

        const ValidaPorcentagem = this.validaPorcentagemAcionamentos(track.frequencia, ConfigObj)
        if (!ValidaPorcentagem) return { result: false }
        this.EncontrouTrackFrequencia = true

        const filteredTrack = this.trackFilter(track, ConfigObj)
        const media = this.calculaMediaFreqAmp(filteredTrack.frequencia, filteredTrack.amplitude)

        if (ConfigObj.AmplitudeValidation && media.amplitude < ConfigObj.MinAmplitude || media.amplitude > ConfigObj.MaxAmplitude) {
            return { result: false }
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
     * @param {{frequencia: number[], amplitude: number[]}} track 
     * @param {object} ConfigObj 
     * @returns {{frequencia: number[], amplitude: number[]}}
     */
    static trackFilter(track, ConfigObj) {
        const amplitudeArray = []
        const frequencyArray = track.frequencia.filter((value, index) => {
            if (value >= ConfigObj.MinFreq && value <= ConfigObj.MaxFreq) {
                amplitudeArray.push(track.amplitude[index])
                return true
            }
        })

        return { frequencia: frequencyArray, amplitude: amplitudeArray }
    }

    /**
     * Calcula a média da frequência e a mediana da amplitude.
     * @param {number[]} freqTrack array da frequência
     * @param {number[]} ampTrack array da amplitude
     * @returns {{frequencia: number, amplitude: number}}
     */
    static calculaMediaFreqAmp(freqTrack, ampTrack) {
        return {
            frequencia: freqTrack.reduce((accumulator, currentValue) => accumulator + currentValue) / freqTrack.length,
            amplitude: ampTrack.sort((a, b) => a - b)[Math.round(ampTrack.length / 2)]
        }
    }

    /**
     * Verifica se o array possui a quantidade mínima de acionamentos válidos.
     * Por exemplo, em um array com 100 valores e 70% de aceitação, pelo menos 70 destes valores devem estar dentro do range mínimo e máximo da frequência.
     * @param {number[]} track array com os valores de frequência lidos
     * @param {object} ConfigObj objeto com os valores de frequência e porcentagem de aceitação
     * @returns {boolean}
     */
    static validaPorcentagemAcionamentos(track, ConfigObj) {
        const validTrackSampleQuantity = track.length * (ConfigObj.PorcentagemAcionamentosValidos / 100)

        const filteredArray = track.filter(frequencia => frequencia >= ConfigObj.MinFreq && frequencia <= ConfigObj.MaxFreq)

        return filteredArray.length >= validTrackSampleQuantity
    }

    /**
     * Método que aguarda um acionamento do trigger para capturar e validar uma track, retornando a mesma caso ela seja válida.
     * @param {object} ConfigObj objeto com os valores usados para a validação
     */
    static async trackCapture(ConfigObj) {
        while (this.AudioContext.state == "running") {
            await this.frequencyTrigger(ConfigObj)
            if (this.AudioContext.state != "running") { return }

            const track = await this.getData(ConfigObj.TrackSize)
            this.lastRead = track

            const validatedTrack = this.trackValidator(track, ConfigObj)
            if (validatedTrack.result) { return validatedTrack }
        }
    }

    /**
     * Inicializa o microfone e cria as instâncias do AudioContext e AnalyserNode
     * @param {{
     *     sampleRate?: number,
     *     fftSize?: number,
     *     smoothingTimeConstant?: number,
     *     gain?: number,
     *     deviceId?: string
     * }} [initOptions]
     * @example
     * const init = await BeepListener.init({ DeviceId: await BeepListener.C930e() })
     * if (!init.success) // setar erro
     */
    static async init(initOptions = {}) {
        initOptions.sampleRate ??= 48000
        initOptions.fftSize ??= 2048
        initOptions.smoothingTimeConstant ??= 0.8
        initOptions.gain ??= 1
        initOptions.deviceId ??= undefined

        if (!await CheckValues()) { return { success: false, msg: "Valores de configuração inválidos" } }

        const getDevice = await this.getAudioDevice(initOptions.deviceId)
        if (getDevice.result) {
            this.createAudioContext(getDevice.device, initOptions.sampleRate)
            this.createAnalyser(initOptions.fftSize, initOptions.smoothingTimeConstant, initOptions.gain)
            await this.AudioContext.suspend()

            this.hertzPerDivision = initOptions.sampleRate / initOptions.fftSize

            Log.console(`AudioContext latency -> ${this.AudioContext.baseLatency * 1000}ms`, Log.Colors.Green.Cyan)

            return { success: true, msg: "Inicialização do microfone concluída com sucesso" }
        }

        return { success: false, msg: "Falha na inicialização do microfone" }

        async function CheckValues() {
            const TypeCheck = await Promise.all([
                BeepListener.CheckType("SampleRate", initOptions.sampleRate, "number"),
                BeepListener.CheckType("FFTSize", initOptions.fftSize, "number"),
                BeepListener.CheckType("SmoothingTimeConstant", initOptions.smoothingTimeConstant, "number"),
                BeepListener.CheckType("Gain", initOptions.gain, "number")
            ])

            for (const result of TypeCheck) {
                if (!result) { return false }
            }

            const RangeCheck = await Promise.all([
                BeepListener.CheckRange("SampleRate", initOptions.sampleRate, 8000, 96000),
                BeepListener.CheckRange("FFTSize", initOptions.fftSize, 32, 32768),
                BeepListener.CheckRange("SmoothingTimeConstant", initOptions.smoothingTimeConstant, 0, 1)
            ])

            for (const result of RangeCheck) {
                if (!result) { return false }
            }

            if (!Number.isInteger(Math.log(initOptions.fftSize) / Math.log(2))) {
                console.error("O valor de FFTSize não é uma potência de 2")
                return false
            }

            return true
        }
    }

    /**
     * Valida o acionamento do beep
     * @param {{
     *     MinFreq?: number,
     *     MaxFreq?: number,
     *     AmplitudeValidation?: boolean,
     *     MinAmplitude?: number,
     *     MaxAmplitude?: number,
     *     PorcentagemAcionamentosValidos?: number,
     *     TrackSize?: number,
     *     TimeOut?: number
     * }} [ConfigObj] objeto com configurações para realizar a captura do beep
     * @returns {Promise<{ success: boolean, msg: string }>} Objeto com o resultado da validação
     */
    static async capture(ConfigObj = {}) {
        ConfigObj.MinFreq ??= 2950
        ConfigObj.MaxFreq ??= 3050

        ConfigObj.AmplitudeValidation ??= true
        ConfigObj.MinAmplitude ??= -30
        ConfigObj.MaxAmplitude ??= -20

        ConfigObj.PorcentagemAcionamentosValidos ??= 70
        ConfigObj.TrackSize ??= 500
        ConfigObj.TimeOut ??= 10000

        if (!await CheckValues()) { return { success: false, msg: "Valores de configuração inválidos" } }

        this.lastRead = {}

        await this.AudioContext.resume()

        const capture = await Promise.race([this.trackCapture(ConfigObj), this.delay(ConfigObj.TimeOut)])

        await this.AudioContext.suspend()

        if (!capture) {
            if (this.EncontrouTrackFrequencia) {
                this.EncontrouTrackFrequencia = false

                console.log({ frequencia: this.lastRead.frequencia, amplitude: this.lastRead.amplitude })
                return { success: false, msg: "Foi detectada uma faixa na frequência esperada, mas fora da amplitude desejada" }

            } else {
                console.log({ frequencia: this.lastRead.frequencia, amplitude: this.lastRead.amplitude })
                return { success: false, msg: "Nenhuma faixa detectada na frequência esperada" }
            }
        } else {
            this.EncontrouTrackFrequencia = false

            return {
                success: true,
                msg: "Faixa detectada dentro dos valores esperados",
                frequencia: {
                    values: capture.frequencia,
                    frequenciaMedia: capture.frequenciaMedia
                },
                amplitude: {
                    values: capture.amplitude,
                    amplitudeMedia: capture.amplitudeMedia
                }
            }
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
     * Ajusta o ganho do microfone e retorna o valor.
     * @param {{
     * MinAmplitude: number, 
     * MaxAmplitude: number,
     * PorcentagemAcionamentosValidos: number,
     * MinFreq: number,
     * MaxFreq: number,
     * TrackSize: number,
     * FirstReadTimeOut: number,
     * CalibrationTimeOut: number
     * }} calibrationOptions
     * @param {number} amplitudeTolerance
     * @param {number} gainStep
     * @returns {Promise<{success: boolean, msg: string, gain?: number}>}
     * @example
     * if (sessionStorage.getItem("gain") == null) {
     *     const calibrateMic = await BeepListener.calibrateMic()
     *     if (calibrateMic.success) {
     *         sessionStorage.setItem("gain", calibrateMic.gain)
     *     } else {
     *         // setar erro
     *     }
     * } else { BeepListener.setGain(parseFloat(sessionStorage.getItem("gain"))) }
    */
    static async calibrateMic(calibrationOptions = {}, amplitudeTolerance = 2, gainStep = 1) {
        calibrationOptions.MinAmplitude ??= -30
        calibrationOptions.MaxAmplitude ??= -20
        calibrationOptions.PorcentagemAcionamentosValidos ??= 70
        calibrationOptions.MinFreq ??= 3050
        calibrationOptions.MaxFreq ??= 3250
        calibrationOptions.TrackSize ??= 300
        calibrationOptions.FirstReadTimeOut ??= 5000
        calibrationOptions.CalibrationTimeOut ??= 10000

        const firstRead = await Promise.race([
            BeepListener.configDeterminator(calibrationOptions),
            this.delay(calibrationOptions.FirstReadTimeOut).then(() => false)
        ])

        if (!firstRead) { return { success: false, msg: "Nenhuma faixa detectada na frequência esperada" } }

        const currentAmplitude = firstRead.amplitude.media
        const centralAmplitude = (calibrationOptions.MinAmplitude + calibrationOptions.MaxAmplitude) / 2
        if (Math.abs(currentAmplitude - centralAmplitude) <= amplitudeTolerance) {
            Log.console(`Novo valor de ganho: ${this.GainNode.gain.value}`, Log.Colors.Green.Cyan)
            return { success: true, msg: `Sucesso ao ajustar o ganho`, gain: this.GainNode.gain.value }
        }

        return await Promise.race([
            this.gainDiscover(calibrationOptions, centralAmplitude, currentAmplitude, this.GainNode.gain.value, gainStep, amplitudeTolerance),
            this.delay(calibrationOptions.CalibrationTimeOut).then(() => { return { success: false, msg: "Tempo de calibração do microfone foi excedido" } })
        ])
    }

    /**
     * 
     * @param {{
     * MinAmplitude: number,
     * MaxAmplitude: number,
     * PorcentagemAcionamentosValidos: number,
     * MinFreq: number,
     * MaxFreq: number,
     * TrackSize: number
     * }} calibrationOptions
     * @param {number} centralAmplitude 
     * @param {number} currentAmplitude
     * @param {number} initialGain
     * @param {number} gainStep
     * @param {number} amplitudeTolerance
     * @returns {Promise<{success: boolean, msg: string, gain: number}>}
    */
    static async gainDiscover(calibrationOptions, centralAmplitude, currentAmplitude, initialGain, gainStep, amplitudeTolerance) {
        this.GainNode.gain.value = initialGain

        /** @type {[number, number][]} */
        let amplitudeSamples = []

        let condition = () => currentAmplitude > centralAmplitude + amplitudeTolerance

        if (currentAmplitude > centralAmplitude) {
            condition = () => currentAmplitude < centralAmplitude - amplitudeTolerance
            gainStep *= -1
        }

        while (!condition() && this.GainNode.gain.value > 0) {
            const currentRead = await BeepListener.configDeterminator(calibrationOptions)
            Log.console(`New Gain -> ${this.GainNode.gain.value}`, Log.Colors.Green.SpringGreen)
            console.log(currentRead)
            const newAmplitude = currentRead.amplitude.media

            if (Math.abs(newAmplitude - centralAmplitude) <= amplitudeTolerance) {
                Log.console(`Novo valor de ganho: ${this.GainNode.gain.value}
                Amplitude: ${newAmplitude}`, Log.Colors.Green.Cyan)
                return { success: true, msg: `Sucesso ao ajustar o ganho`, gain: this.GainNode.gain.value }
            }

            currentAmplitude = newAmplitude
            amplitudeSamples.push([this.GainNode.gain.value, newAmplitude])
            this.GainNode.gain.value += gainStep
        }

        if (currentAmplitude > centralAmplitude) { amplitudeSamples = amplitudeSamples.reverse() }

        if (amplitudeSamples.length > 1 && this.GainNode.gain.value > 0) {
            amplitudeSamples = [amplitudeSamples.findLast(sample => sample[1] < centralAmplitude - amplitudeTolerance)]
        }

        return await this.gainDiscover(
            calibrationOptions,
            centralAmplitude,
            amplitudeSamples[0][1],
            amplitudeSamples[0][0],
            Math.abs(gainStep / 2),
            amplitudeTolerance
        )
    }


    /**
     * Sets the gain value of the Gain node.
     * @param {number} gain - The new gain value to set.
     */
    static setGain(gain) { this.GainNode.gain.value = gain }

    /**
     * Retorna um array com os valores de frequência lidos no tempo que foi passado
     * @param {number} time
     * @returns {Promise<number[]>} 
     * @example
     * console.log(await BeepListener.frequencyReader(1000))
     */
    static async frequencyReader(time) {
        await this.AudioContext.resume()

        const Track = await this.getData(time)

        await this.AudioContext.suspend()
        return Track.frequencia
    }

    /**
     * 
     * @param {{
     *     MinFreq?: number,
     *     MaxFreq?: number,
     *     PorcentagemAcionamentosValidos?: number,
     *     TrackSize?: number
     *     AmplitudeValidation?: boolean
     * }} [ConfigObj] objeto com configurações para detecção da faixa
     * @returns {Promise<{
     *     success: boolean,
     *     msg?: string,
     *     frequencia?: {min: number, max: number, media: number, valores: number[]},
     *     amplitude?: {min: number, max: number, media: number, valores: number[]},
     * }>}
     * @example
     * console.log(await BeepListener.configDeterminator())
     */
    static async configDeterminator(ConfigObj = {}) {
        ConfigObj.MinFreq ??= 2950
        ConfigObj.MaxFreq ??= 3050
        ConfigObj.PorcentagemAcionamentosValidos ??= 70
        ConfigObj.TrackSize ??= 500
        ConfigObj.AmplitudeValidation = false
        ConfigObj.TimeOut ??= 10000

        if (!await CheckValues()) { return { success: false, msg: "Valores de configuração são inválidos" } }

        await this.AudioContext.resume()
        this.delay(ConfigObj.TimeOut).then(() => { this.AudioContext.suspend() })

        while (this.AudioContext.state == "running") {
            await this.frequencyTrigger(ConfigObj)
            if (this.AudioContext.state == "suspended") { return { success: false, msg: "Falha na detecção da faixa esperada" } }

            const Track = await this.getData(ConfigObj.TrackSize)

            const ValidatedTrack = this.trackValidator(Track, ConfigObj)

            if (ValidatedTrack.result) {
                await this.AudioContext.suspend()

                return {
                    success: true,
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
            }
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