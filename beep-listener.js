/**
 * Classe que faz a manipulação dos dados obtidos pelo microfone, permitindo a validação do beep dos controladores
 * @example
 * import BeepListener from "../node_modules/@libs-scripts-mep/beep-listener/beep-listener.js"
 */
export default class BeepListener {
    //#region TypeDefinitions

    /**
     * @typedef {{
     *     minFreq: number,
     *     maxFreq: number,
     *     amplitudeValidation: boolean,
     *     validTrackPercentage: number,
     *     trackSize: number,
     *     minAmplitude?: number,
     *     maxAmplitude?: number,
     *     timeOut?: number,
     *     firstReadTimeOut?: number,
     *     calibrationTimeOut?: number
     * }} captureOptions Objeto com opções para realizar a captura do beep
     * 
     * @typedef {{
     *     frequencia: number[],
     *     amplitude: number[]
     * }} track Objeto com os arrays de frequência e amplitude
    */

    //#endregion TypeDefinitions

    //#region Properties

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
     * Armazena as últimas leituras, permite visualizar o que foi lido quando ocorrem erros
     * @type {track[]}
     */
    static lastReads = []
    //#endregion Properties

    //#region DeviceIds

    /** 
     * Localiza o ID de um dispositivo baseado no filtro passado
     * @param {function({ kind: string, label: string, deviceId: string }): boolean} deviceFilter Filtro para encontrar o dispositivo
     */
    static async findDeviceId(deviceFilter) {
        const DeviceList = await navigator.mediaDevices.enumerateDevices()
        const Device = DeviceList.find(deviceFilter)
        if (Device) { return Device.deviceId }
    }

    /**
     * Localiza o ID da Webcam Logitech C930e
     * 
     * ![Image](https://i.imgur.com/9YnqdVk.png)
     */
    static async C930e() {
        const filter = device => device.kind == "audioinput" && device.label.includes("C930e") && !device.deviceId.includes("communications") && !device.deviceId.includes("default")
        return await this.findDeviceId(filter)
    }

    /**
     * Localiza o ID do Microfone de lapela USB HS-29
     * 
     * ![Image](https://i.imgur.com/DffAe6i.png)
     */
    static async HS_29() {
        const filter = device => device.kind == "audioinput" && device.label.includes("AB13X") && !device.deviceId.includes("communications") && !device.deviceId.includes("default")
        return await this.findDeviceId(filter)
    }
    //#endregion DeviceIds

    //#region Init

    /**
    * Inicializa o microfone e cria as instâncias do AudioContext e AnalyserNode
    * @param {{
    *     sampleRate?: number,
    *     fftSize?: number,
    *     smoothingTimeConstant?: number,
    *     gain?: number,
    *     deviceId?: string
    * }} initOptions
    * @returns {Promise<{success: boolean, msg?: string}>}
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

        const checkParams = ParameterValidator.validate(initOptions)
        if (!checkParams.success) { return checkParams }

        const getDevice = await this.getAudioDevice(initOptions.deviceId)
        if (getDevice.result) {
            this.createAudioContext(getDevice.device, initOptions.sampleRate)
            this.createAnalyser(initOptions.fftSize, initOptions.smoothingTimeConstant, initOptions.gain)
            await this.AudioContext.suspend()

            this.hertzPerDivision = initOptions.sampleRate / initOptions.fftSize

            console.log(`%cAudioContext latency -> ${this.AudioContext.baseLatency * 1000}ms`, "color: #00FFFF")

            return { success: true, msg: "Inicialização do microfone concluída com sucesso" }
        }

        return { success: false, msg: "Falha na inicialização do microfone" }
    }

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
    //#endregion Init

    //#region DataAcquisition

    /**
     * Retorna um objeto com os valores de frequência e amplitude obtidos no tempo que foi passado
     * @param {number} time Tempo em que serão obtidas as amostras de frequência e amplitude
     * @param {boolean} triggerSample Se true, será obtida apenas uma amostra de frequência e amplitude para utilizar como trigger
     * @returns {Promise<track>}
     * 
     */
    static async getData(time, triggerSample = false) {
        /**@type {number[]} */
        const frequencyBuffer = []
        /**@type {number[]} */
        const amplitudeBuffer = []

        let loopControl = true

        if (!triggerSample) { this.delay(time).then(() => { loopControl = false }) }

        while (loopControl) {
            const sample = this.freqSample()
            const frequency = this.pitch(sample.timeDomain)
            frequencyBuffer.push(frequency)

            const amplitude = this.findAmplitude(frequency, sample.frequencyDomain)
            amplitudeBuffer.push(amplitude)

            await this.delay(0) // Precisa disto para não travar o navegador

            if (triggerSample) { break }
        }

        const roundedValues = this.fixValues(frequencyBuffer, amplitudeBuffer)

        return { frequencia: roundedValues.frequencia, amplitude: roundedValues.amplitude }
    }

    /**
     * Permite extrair um valor de frequência do TimeDomainArray  
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
     * @param {number[]} freqBuffer array da frequência
     * @param {number[]} ampBuffer array da amplitude
     * @returns {track}
     */
    static fixValues(freqBuffer, ampBuffer) {
        return { frequencia: fix(freqBuffer), amplitude: fix(ampBuffer) }

        /**
         * @param {number[]} buffer
         */
        function fix(buffer) {
            return buffer.map(value => !isNaN(value) && !Number.isInteger(value) ? parseFloat(value.toFixed(2)) : value)
        }
    }

    /**
     * Obtém uma amostra e retorna os arrays do domínio da frequência e do domínio do tempo, usando
     * [getFloatTimeDomainData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) e
     * [getFloatFrequencyData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatFrequencyData)
     */
    static freqSample() {
        const frequencyDataArray = new Float32Array(this.Analyser.fftSize)
        const timeDomainDataArray = new Float32Array(this.Analyser.fftSize)

        this.Analyser.getFloatTimeDomainData(timeDomainDataArray)
        this.Analyser.getFloatFrequencyData(frequencyDataArray)

        return { timeDomain: timeDomainDataArray, frequencyDomain: frequencyDataArray }
    }

    /**
     * Retorna o valor de amplitude referente à frequência passada
     * @param {number} frequency frequência de referência
     * @param {Float32Array} amplitudeArray array do domínio da frequência
     * @returns {number} valor de amplitude referente à frequência passada
     */
    static findAmplitude(frequency, amplitudeArray) { return amplitudeArray[Math.round(frequency / this.hertzPerDivision)] }
    //#endregion DataAcquisition

    //#region DataValidation

    /**
     * Valida se a track passada está dentro dos valores de frequência e amplitude esperados
     * @param {track} track objeto com os arrays de frequência e amplitude
     * @param {captureOptions} captureOptions objeto com os valores de frequência
     * @returns {{ result: boolean, frequencia?: number[], frequenciaMedia?: number, amplitude?: number[], amplitudeMedia?: number }}
     */
    static trackValidator(track, captureOptions) {

        const percentageValidation = this.validateTrackPercentage(track.frequencia, captureOptions)
        if (!percentageValidation) return { result: false }

        const filteredTrack = this.trackFilter(track, captureOptions)
        const media = this.calculateMedia(filteredTrack.frequencia, filteredTrack.amplitude)

        if (captureOptions.amplitudeValidation && (media.amplitude < captureOptions.minAmplitude || media.amplitude > captureOptions.maxAmplitude)) {
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
     * Filtra a track, mantendo apenas os valores de frequência que estão dentro do esperado e suas respectivas amplitudes
     * @param {track} track 
     * @param {captureOptions} captureOptions 
     * @returns {track}
     */
    static trackFilter(track, captureOptions) {
        const amplitudeArray = []
        const frequencyArray = track.frequencia.filter((value, index) => {
            if (value >= captureOptions.minFreq && value <= captureOptions.maxFreq) {
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
    static calculateMedia(freqTrack, ampTrack) {
        return {
            frequencia: freqTrack.reduce((accumulator, currentValue) => accumulator + currentValue) / freqTrack.length,
            amplitude: ampTrack.sort((a, b) => a - b)[Math.round(ampTrack.length / 2)]
        }
    }

    /**
     * Verifica se o array possui a quantidade mínima de valores dentro do esperado.
     * Por exemplo, em um array com 100 valores e 70% de aceitação, pelo menos 70 destes valores devem estar dentro do range esperado de frequência.
     * @param {number[]} frequencyBuffer array com os valores de frequência lidos
     * @param {captureOptions} captureOptions objeto com os valores de frequência e porcentagem de aceitação
     * @returns {boolean}
     */
    static validateTrackPercentage(frequencyBuffer, captureOptions) {
        const validTrackSampleQuantity = frequencyBuffer.length * (captureOptions.validTrackPercentage / 100)

        const filteredArray = frequencyBuffer.filter(frequencia => frequencia >= captureOptions.minFreq && frequencia <= captureOptions.maxFreq)

        return filteredArray.length >= validTrackSampleQuantity
    }
    //#endregion DataValidation

    //#region Capture

    /**
    * Valida o acionamento do beep
    * @param {{
    *     minFreq?: number,
    *     maxFreq?: number,
    *     amplitudeValidation?: boolean,
    *     minAmplitude?: number,
    *     maxAmplitude?: number,
    *     validTrackPercentage?: number,
    *     trackSize?: number,
    *     timeOut?: number
    * }} captureOptions objeto com configurações para realizar a captura do beep
    * @returns {Promise<{ 
    *     success: boolean, 
    *     msg: string,
    *     lastTracks?: track[],
    *     frequencia?: {
    *         values: number[],
    *         frequenciaMedia: number,
    *     },
    *     amplitude?: {
    *         values: number[],
    *         amplitudeMedia: number,
    *     }
    * }>} Objeto com o resultado da validação
    */
    static async capture(captureOptions = {}) {
        captureOptions.minFreq ??= 2950
        captureOptions.maxFreq ??= 3050
        captureOptions.amplitudeValidation ??= true
        captureOptions.minAmplitude ??= -30
        captureOptions.maxAmplitude ??= -20
        captureOptions.validTrackPercentage ??= 70
        captureOptions.trackSize ??= 500
        captureOptions.timeOut ??= 10000

        const checkParams = ParameterValidator.validate(captureOptions)
        if (!checkParams.success) { return checkParams }

        await this.AudioContext.resume()

        const capture = await Promise.race([this.trackCapture(captureOptions), this.delay(captureOptions.timeOut)])

        await this.AudioContext.suspend()

        if (!capture) {
            return {
                success: false,
                msg: this.lastReads.find(track => this.validateTrackPercentage(track.frequencia, captureOptions))
                    ? "Faixa detectada na frequência esperada, mas fora da amplitude desejada"
                    : "Nenhuma faixa detectada na frequência esperada",
                lastTracks: this.lastReads
            }
        }

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

    /**
     * Verifica a frequência a cada 50ms e retorna caso ela esteja dentro dos valores de frequência e, opcionalmente, de amplitude
     * @param {captureOptions} captureOptions objeto com os valores para fazer a detecção do trigger
     */
    static async frequencyTrigger(captureOptions) {
        while (this.AudioContext.state == "running") {
            const sample = await this.getData(0, true)

            if (sample.frequencia[0] >= captureOptions.minFreq && sample.frequencia[0] <= captureOptions.maxFreq) {
                if (captureOptions.amplitudeValidation) {
                    if (sample.amplitude[0] >= captureOptions.minAmplitude && sample.amplitude[0] <= captureOptions.maxAmplitude) { return }
                } else { return }
            }

            await this.delay(50)
        }
    }

    /**
     * Método que aguarda um acionamento do trigger para capturar e validar uma track, retornando a mesma caso ela seja válida.
     * @param {captureOptions} captureOptions objeto com os valores usados para a validação
     */
    static async trackCapture(captureOptions) {
        this.lastReads = []

        while (this.AudioContext.state == "running") {
            await this.frequencyTrigger(captureOptions)
            if (this.AudioContext.state != "running") { return }

            const track = await this.getData(captureOptions.trackSize)
            this.lastReads.push(track)

            const validatedTrack = this.trackValidator(track, captureOptions)
            if (validatedTrack.result) { return validatedTrack }
        }
    }
    //#endregion Capture

    //#region MicrophoneCalibration

    /**
     * Ajusta o ganho do microfone e retorna o valor.
     * @param {{
     * minAmplitude?: number, 
     * maxAmplitude?: number,
     * validTrackPercentage?: number,
     * minFreq?: number,
     * maxFreq?: number,
     * trackSize?: number,
     * firstReadTimeOut?: number,
     * calibrationTimeOut?: number
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
        calibrationOptions.minAmplitude ??= -30
        calibrationOptions.maxAmplitude ??= -20
        calibrationOptions.validTrackPercentage ??= 70
        calibrationOptions.minFreq ??= 3050
        calibrationOptions.maxFreq ??= 3250
        calibrationOptions.trackSize ??= 300
        calibrationOptions.firstReadTimeOut ??= 5000
        calibrationOptions.calibrationTimeOut ??= 10000

        const checkParams = ParameterValidator.validate(calibrationOptions)
        if (!checkParams.success) { return checkParams }

        const firstRead = await BeepListener.configDeterminator(
            // Object.assign(JSON.parse(JSON.stringify(calibrationOptions)), { timeOut: calibrationOptions.firstReadTimeOut })
            calibrationOptions
        )

        if (!firstRead.success) { return { success: false, msg: "Nenhuma faixa detectada na frequência esperada" } }

        const currentAmplitude = firstRead.amplitude.media
        const centralAmplitude = (calibrationOptions.minAmplitude + calibrationOptions.maxAmplitude) / 2
        if (Math.abs(currentAmplitude - centralAmplitude) <= amplitudeTolerance) {
            console.log(`%cNew Gain value: ${this.GainNode.gain.value}`, "color: #00FFFF")
            return { success: true, msg: `Sucesso ao ajustar o ganho`, gain: this.GainNode.gain.value }
        }

        return await Promise.race([
            this.gainDiscover(calibrationOptions, centralAmplitude, currentAmplitude, this.GainNode.gain.value, gainStep, amplitudeTolerance),
            this.delay(calibrationOptions.calibrationTimeOut).then(() => { return { success: false, msg: "Tempo de calibração do microfone foi excedido" } })
        ])
    }

    /**
     * 
     * @param {captureOptions} calibrationOptions
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
            console.log(`%cTesting with Gain -> ${this.GainNode.gain.value}`, "color: #00FF7F")
            console.log(currentRead)
            const newAmplitude = currentRead.amplitude.media

            if (Math.abs(newAmplitude - centralAmplitude) <= amplitudeTolerance) {
                console.log(`%cNew Gain value: ${this.GainNode.gain.value}`, "color: #00FFFF")
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
    //#endregion MicrophoneCalibration

    //#region ConfigDiscovererMethods

    /**
     * Retorna um array com os valores de frequência lidos no tempo que foi passado
     * @param {number} time
     * @returns {Promise<number[]>} 
     * @example
     * console.log(await BeepListener.frequencyReader(1000))
     */
    static async frequencyReader(time) {
        await this.AudioContext.resume()

        const track = await this.getData(time)

        await this.AudioContext.suspend()
        return track.frequencia
    }

    /**
     * Usado para determinar as características de uma faixa de uma frequência específica
     * @param {{
     *     minFreq?: number,
     *     maxFreq?: number,
     *     validTrackPercentage?: number,
     *     trackSize?: number,
     *     amplitudeValidation?: boolean,
     *     timeOut?: number
     * }} captureOptions objeto com configurações para detecção da faixa
     * @returns {Promise<{
     *     success: boolean,
     *     msg?: string,
     *     frequencia?: {min: number, max: number, media: number, valores: number[]},
     *     amplitude?: {min: number, max: number, media: number, valores: number[]},
     * }>}
     * @example
     * console.log(await BeepListener.configDeterminator())
     */
    static async configDeterminator(captureOptions = {}) {
        captureOptions.minFreq ??= 2950
        captureOptions.maxFreq ??= 3050
        captureOptions.validTrackPercentage ??= 70
        captureOptions.trackSize ??= 500
        captureOptions.amplitudeValidation = false
        captureOptions.timeOut ??= 10000

        const checkParams = ParameterValidator.validate(captureOptions)
        if (!checkParams.success) { return checkParams }

        this.lastReads = []
        let captureSuccess = false

        await this.AudioContext.resume()
        this.delay(captureOptions.timeOut).then(() => { if (!captureSuccess) { this.AudioContext.suspend(); console.log(this.lastReads) } })

        while (this.AudioContext.state == "running") {
            await this.frequencyTrigger(captureOptions)
            if (this.AudioContext.state != "running") { break }

            const track = await this.getData(captureOptions.trackSize)
            this.lastReads.push(track)

            const validatedTrack = this.trackValidator(track, captureOptions)

            if (validatedTrack.result) {
                await this.AudioContext.suspend()
                captureSuccess = true

                return {
                    success: true,
                    frequencia: {
                        min: Math.min(...validatedTrack.frequencia),
                        max: Math.max(...validatedTrack.frequencia),
                        media: validatedTrack.frequenciaMedia,
                        valores: validatedTrack.frequencia
                    },
                    amplitude: {
                        min: Math.min(...validatedTrack.amplitude),
                        max: Math.max(...validatedTrack.amplitude),
                        media: validatedTrack.amplitudeMedia,
                        valores: validatedTrack.amplitude
                    }
                }
            }
        }

        return { success: false, msg: "Falha na detecção da faixa esperada" }
    }
    //#endregion ConfigDiscovererMethods

    static { window.BeepListener = this }

}

//#region ParameterValidation
export class ParameterValidator {

    static parameterCheckConfigs = {
        sampleRate: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.sampleRate.value] },
                msg: "sampleRate deve ser um número"
            },
            valueCheck: {
                condition: (value) => value >= 8000 && value <= 96000,
                get params() { return [ParameterValidator.parameterCheckConfigs.sampleRate.value] },
                msg: "sampleRate deve estar entre 8000 e 96000"
            }
        },
        fftSize: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.fftSize.value] },
                msg: "fftSize deve ser um número"
            },
            valueCheck: {
                condition: (value) => value >= 32 && value <= 32768 && Number.isInteger(Math.log(value) / Math.log(2)),
                get params() { return [ParameterValidator.parameterCheckConfigs.fftSize.value] },
                msg: "fftSize deve estar entre 32 e 32768 e deve ser uma potência de 2"
            }
        },
        smoothingTimeConstant: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.smoothingTimeConstant.value] },
                msg: "smoothingTimeConstant deve ser um número"
            },
            valueCheck: {
                condition: (value) => value >= 0 && value <= 1,
                get params() { return [ParameterValidator.parameterCheckConfigs.smoothingTimeConstant.value] },
                msg: "smoothingTimeConstant deve estar entre 0 e 1"
            }
        },
        gain: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.gain.value] },
                msg: "gain deve ser um número"
            }
        },
        deviceId: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "string" || value == undefined,
                get params() { return [ParameterValidator.parameterCheckConfigs.deviceId.value] },
                msg: "deviceId deve ser uma string ou undefined"
            }
        },
        minFreq: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.minFreq.value] },
                msg: "minFreq deve ser um número"
            },
            valueCheck: {
                condition: (value) => value > 0,
                get params() { return [ParameterValidator.parameterCheckConfigs.minFreq.value] },
                msg: "minFreq deve ser maior que 0"
            },
            rangeCheck: {
                condition: (minFreq, maxFreq) => minFreq <= maxFreq,
                get params() { return [ParameterValidator.parameterCheckConfigs.minFreq.value, ParameterValidator.parameterCheckConfigs.maxFreq.value] },
                msg: "minFreq deve ser menor ou igual a maxFreq"
            }
        },
        maxFreq: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.maxFreq.value] },
                msg: "maxFreq deve ser um número"
            },
            valueCheck: {
                condition: (value) => value > 0,
                get params() { return [ParameterValidator.parameterCheckConfigs.maxFreq.value] },
                msg: "maxFreq deve ser maior que 0"
            }
        },
        amplitudeValidation: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "boolean",
                get params() { return [ParameterValidator.parameterCheckConfigs.amplitudeValidation.value] },
                msg: "amplitudeValidation deve ser um booleano"
            }
        },
        minAmplitude: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.minAmplitude.value] },
                msg: "minAmplitude deve ser um número"
            },
            rangeCheck: {
                condition: (minAmplitude, maxAmplitude) => minAmplitude <= maxAmplitude,
                get params() { return [ParameterValidator.parameterCheckConfigs.minAmplitude.value, ParameterValidator.parameterCheckConfigs.maxAmplitude.value] },
                msg: "minAmplitude deve ser menor ou igual a maxAmplitude"
            }
        },
        maxAmplitude: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.maxAmplitude.value] },
                msg: "maxAmplitude deve ser um número"
            }
        },
        validTrackPercentage: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.validTrackPercentage.value] },
                msg: "validTrackPercentage deve ser um número"
            },
            valueCheck: {
                condition: (value) => value >= 0 && value <= 100,
                get params() { return [ParameterValidator.parameterCheckConfigs.validTrackPercentage.value] },
                msg: "validTrackPercentage deve estar entre 0 e 100"
            }
        },
        trackSize: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.trackSize.value] },
                msg: "trackSize deve ser um número"
            },
            valueCheck: {
                condition: (value) => value > 0,
                get params() { return [ParameterValidator.parameterCheckConfigs.trackSize.value] },
                msg: "trackSize deve ser maior que 0"
            }
        },
        timeOut: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.timeOut.value] },
                msg: "timeOut deve ser um número"
            }
        },
        firstReadTimeOut: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.firstReadTimeOut.value] },
                msg: "firstReadTimeOut deve ser um número"
            }
        },
        calibrationTimeOut: {
            value: undefined,
            typeCheck: {
                condition: (value) => typeof value == "number",
                get params() { return [ParameterValidator.parameterCheckConfigs.calibrationTimeOut.value] },
                msg: "calibrationTimeOut deve ser um número"
            }
        }
    }

    /**
     * @param {{[parameterName: string]: number | string | boolean | undefined}} params
     * @returns {{success: boolean, msg?: string}}
     */
    static validate(params) {
        for (const parameter in params) {
            if (!(parameter in this.parameterCheckConfigs)) {
                return { success: false, msg: `Parâmetro ${parameter} não está configurado no objeto parameterCheckConfigs` }
            }

            this.parameterCheckConfigs[parameter].value = params[parameter]
        }

        const validationOptions = ["typeCheck", "valueCheck", "rangeCheck"]

        for (const validationType of validationOptions) {
            for (const parameter in params) {
                if (validationType in this.parameterCheckConfigs[parameter]) {
                    const check = this.check(
                        this.parameterCheckConfigs[parameter][validationType].condition,
                        this.parameterCheckConfigs[parameter][validationType].params,
                        this.parameterCheckConfigs[parameter][validationType].msg
                    )

                    if (!check.success) { return check }
                }
            }
        }

        return { success: true }
    }

    /**
     * 
     * @param {function(...arg0): boolean} condition
     * @param {array} params
     * @param {string} msg
     */
    static check(condition, params, msg) { return condition(...params) ? { success: true } : { success: false, msg } }
}
//#endregion ParameterValidation