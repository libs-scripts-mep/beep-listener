class BeepListener {

    static async GetAudioDevice() {
        const AudioDevice = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false } })
            .then(Device => {
                return { result: true, device: Device }
            })
            .catch(Error => {
                console.error(Error)
                return { result: false, error: Error }
            })

        return AudioDevice
    }


    static CreateAudioContext(AudioDevice, ParamObj) {
        this.AudioContext = new AudioContext({ sampleRate: ParamObj.SampleRate, latencyHint: "interactive" })
        this.AudioSourceNode = this.AudioContext.createMediaStreamSource(AudioDevice)
    }

    static async SuspendAudioContext() {
        await this.AudioContext.suspend()
    }

    static async ResumeAudioContext() {
        await this.AudioContext.resume()
    }


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


    static async AsyncDelay(timeout) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(false)
            }, timeout)
        })
    }

    static FixValues(FreqBuffer, AmpBuffer) {
        let FreqArray = []
        let AmpArray = []

        for (const FreqValue of FreqBuffer) {
            if (FreqValue % 1 != 0 && !isNaN(FreqValue)) {
                FreqArray.push(parseFloat(FreqValue.toFixed(2)))
            } else {
                FreqArray.push(FreqValue)
            }
        }

        for (const AmpValue of AmpBuffer) {
            if (AmpValue % 1 != 0 && !isNaN(AmpValue)) {
                AmpArray.push(parseFloat(AmpValue.toFixed(2)))
            } else {
                AmpArray.push(AmpValue)
            }
        }

        return { frequencia: FreqArray, amplitude: AmpArray }
    }


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


    // Localiza no array o valor de amplitude referente à frequência passada
    static LocalizaAmplitude(Frequencia, AmplitudeArray) {
        let PosicaoArray = Math.floor(Frequencia / this.HertzPorDivisao)
        return AmplitudeArray[PosicaoArray]
    }


    static async TriggerFrequencyDetector(ConfigObj, ValidaAmplitude = false) {
        if (this.AudioContext.state == "running") {

            const Sample = await this.GetData(0, true)
            await this.AsyncDelay(50)
            if (Sample.frequencia[0] >= ConfigObj.MinFreq && Sample.frequencia[0] <= ConfigObj.MaxFreq) {
                if (ValidaAmplitude) {
                    if (Sample.amplitude[0] >= ConfigObj.TriggerMinAmp && Sample.amplitude[0] <= ConfigObj.TriggerMaxAmp) {
                        return
                    } else {
                        return (this.TriggerFrequencyDetector(ConfigObj, ValidaAmplitude))
                    }
                } else {
                    return
                }
            } else {
                return (this.TriggerFrequencyDetector(ConfigObj, ValidaAmplitude))
            }
        } else {
            return
        }
    }


    static async TrackSlicer(Track, ConfigObj, ValidaAmplitude = false) {
        const QuantidadeAmostrasTrackAcionamento = Track.frequencia.length / (ConfigObj.TrackSize / ConfigObj.TempoDeAcionamento)

        for (let Index = 0; Index < Track.frequencia.length; Index++) {
            if (Track.frequencia.length - Index >= QuantidadeAmostrasTrackAcionamento) {

                const FreqValue = Track.frequencia[Index]
                if (FreqValue >= ConfigObj.MinFreq && FreqValue <= ConfigObj.MaxFreq) {

                    const FrequencyTrack = Track.frequencia.slice(Index, Index + QuantidadeAmostrasTrackAcionamento)
                    const ValidaPorcentagem = this.ValidaPorcentagemAcionamentos(FrequencyTrack, ConfigObj)

                    if (ValidaPorcentagem) {
                        this.EncontrouTrackFrequencia = true
                        const AmplitudeTrack = Track.amplitude.slice(Index, Index + QuantidadeAmostrasTrackAcionamento)

                        if (ValidaAmplitude) {
                            const Media = this.CalculaMediaFreqAmp(FrequencyTrack, AmplitudeTrack, ConfigObj)
                            if (Media.amplitude >= ConfigObj.MinAmplitude && Media.amplitude <= ConfigObj.MaxAmplitude) {
                                return {
                                    result: true,
                                    frequencia: FrequencyTrack,
                                    frequenciaMedia: Media.frequencia,
                                    amplitude: AmplitudeTrack,
                                    amplitudeMedia: Media.amplitude
                                }
                            }

                        } else {
                            return { result: true, frequencia: FrequencyTrack, amplitude: AmplitudeTrack }
                        }
                    }
                }

            } else {
                return { result: false }
            }

        }
    }

    static CalculaMediaFreqAmp(FreqTrack, AmpTrack, ConfigObj) {

        let SomaValoresFrequencia = 0
        let SomaValoresAmplitude = 0
        let Contador = 0

        FreqTrack.forEach((FreqValue, Index) => {
            if (FreqValue >= ConfigObj.MinFreq && FreqValue <= ConfigObj.MaxFreq) {
                SomaValoresFrequencia += FreqValue
                SomaValoresAmplitude += AmpTrack[Index]
                Contador++
            }
        })

        return {
            frequencia: SomaValoresFrequencia / Contador,
            amplitude: SomaValoresAmplitude / Contador
        }
    }

    static ValidaPorcentagemAcionamentos(Track, ConfigObj) {
        const AmostrasNecessariasParaTrackValida = Track.length * (ConfigObj.PorcentagemAcionamentosValidos / 100)
        let Contador = 0

        for (const Valor of Track) {
            if (Valor >= ConfigObj.MinFreq && Valor <= ConfigObj.MaxFreq) {
                Contador++
            }
        }

        if (Contador >= AmostrasNecessariasParaTrackValida) {
            return true
        } else {
            return false
        }
    }

    static async TrackCapture(ConfigObj) {
        await this.TriggerFrequencyDetector(ConfigObj, true)

        if (this.AudioContext.state == "running") {
            const Track = await this.GetData(ConfigObj.TrackSize)

            this.LastRead = Track

            const SlicedTrack = await this.TrackSlicer(Track, ConfigObj, true)
            if (SlicedTrack.result) {
                return SlicedTrack
            } else {
                return this.TrackCapture(ConfigObj)
            }
        } else {
            return
        }
    }

    static async Init(ParamObj = {}) {
        ParamObj.SampleRate ||= 48000
        ParamObj.FFTSize ||= 2048
        ParamObj.SmoothingTimeConstant ||= 0.8
        ParamObj.Gain ||= 1

        const GetDevice = await this.GetAudioDevice()

        if (GetDevice.result) {
            this.CreateAudioContext(GetDevice.device, ParamObj)
            this.CreateAnalyser(ParamObj)

            this.HertzPorDivisao = ParamObj.SampleRate / ParamObj.FFTSize

            await this.SuspendAudioContext()
            return { result: true, latencia: `${this.AudioContext.baseLatency * 1000}ms` }
        } else {
            return { result: false }
        }
    }


    static async Capture(ConfigObj = {}) {
        ConfigObj.MinFreq ||= 2950
        ConfigObj.MaxFreq ||= 3050
        ConfigObj.MinAmplitude ||= -30
        ConfigObj.MaxAmplitude ||= -20

        ConfigObj.TriggerMinAmp ||= -35
        ConfigObj.TriggerMaxAmp ||= -18

        ConfigObj.TempoDeAcionamento ||= 500
        ConfigObj.PorcentagemAcionamentosValidos ||= 70
        ConfigObj.TrackSize ||= 700
        ConfigObj.TimeOut ||= 10000

        await this.ResumeAudioContext()

        this.LastRead = {}

        const Capture = await Promise.race([this.TrackCapture(ConfigObj), this.AsyncDelay(ConfigObj.TimeOut)])

        await this.SuspendAudioContext()

        if (!Capture) {

            if (this.EncontrouTrackFrequencia) {
                this.EncontrouTrackFrequencia = false

                return {
                    result: false,
                    msg: "Foi detectada uma faixa na frequência esperada, mas fora da amplitude desejada",
                    frequencia: this.LastRead.frequencia,
                    amplitude: this.LastRead.amplitude
                }

            } else {
                return {
                    result: false,
                    msg: "Nenhuma faixa detectada na frequência esperada",
                    frequencia: this.LastRead.frequencia,
                    amplitude: this.LastRead.amplitude
                }
            }
        } else {
            this.EncontrouTrackFrequencia = false

            return {
                result: true,
                msg: "Faixa detectada dentro dos valores esperados",
                frequencia: {
                    valores: Capture.frequencia,
                    frequenciaMedia: Capture.frequenciaMedia
                },
                amplitude: {
                    valores: Capture.amplitude,
                    amplitudeMedia: Capture.amplitudeMedia
                }
            }
        }
    }


    static async LeituraFrequenciaParaConfigurar(TempoTotalLeitura) {
        await this.ResumeAudioContext()

        const Track = await this.GetData(TempoTotalLeitura)

        console.log(Track.frequencia)
        await this.SuspendAudioContext()
    }


    static async DeterminaFrequenciaAmplitudeParaConfigurar(ConfigObj = {}) {
        ConfigObj.MinFreq ||= 2950
        ConfigObj.MaxFreq ||= 3050
        ConfigObj.TempoDeAcionamento ||= 500
        ConfigObj.PorcentagemAcionamentosValidos ||= 70
        ConfigObj.TrackSize ||= 700

        await this.ResumeAudioContext()

        await this.TriggerFrequencyDetector(ConfigObj)
        const Track = await this.GetData(ConfigObj.TrackSize)

        const SlicedTrack = await this.TrackSlicer(Track, ConfigObj)

        if (SlicedTrack.result) {

            let MaiorFrequencia, MenorFrequencia, MaiorAmplitude, MenorAmplitude
            let ConfigurouValores = false

            for (let Index = 0; Index < SlicedTrack.frequencia.length; Index++) {
                const FreqValue = SlicedTrack.frequencia[Index]
                const AmplitudeValue = SlicedTrack.amplitude[Index]

                if (FreqValue >= ConfigObj.MinFreq && FreqValue <= ConfigObj.MaxFreq) {

                    if (!ConfigurouValores) {
                        ConfigurouValores = true

                        MaiorFrequencia = FreqValue
                        MenorFrequencia = FreqValue
                        MaiorAmplitude = AmplitudeValue
                        MenorAmplitude = AmplitudeValue
                    }

                    if (FreqValue > MaiorFrequencia) {
                        MaiorFrequencia = FreqValue
                    }
                    if (FreqValue < MenorFrequencia) {
                        MenorFrequencia = FreqValue
                    }
                    if (AmplitudeValue > MaiorAmplitude) {
                        MaiorAmplitude = AmplitudeValue
                    }
                    if (AmplitudeValue < MenorAmplitude) {
                        MenorAmplitude = AmplitudeValue
                    }
                }

            }

            const Media = this.CalculaMediaFreqAmp(SlicedTrack.frequencia, SlicedTrack.amplitude, ConfigObj)

            await this.SuspendAudioContext()

            return {
                frequencia: { min: MenorFrequencia, max: MaiorFrequencia, media: Media.frequencia, valores: SlicedTrack.frequencia },
                amplitude: { min: MenorAmplitude, max: MaiorAmplitude, media: Media.amplitude, valores: SlicedTrack.amplitude }
            }

        } else {
            return this.DeterminaFrequenciaAmplitudeParaConfigurar(ConfigObj)
        }
    }

}