class BeepListener {
    constructor() {
        this.AudioContext
        this.AudioSourceNode
        this.Gain
        this.Analyser

        this.HertzPorDivisao

        this.EncontrouTrackFrequencia = false
    }


    static GetAudioDevice() {
        return new Promise((resolve, reject) => {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(Device => {
                    resolve(Device)
                })
                .catch(Error => {
                    console.error(Error)
                    reject(false)
                })
        })
    }


    static CreateAudioContext(AudioDevice, ParamObj) {
        this.AudioContext = new AudioContext({ sampleRate: ParamObj.SampleRate, latencyHint: "interactive" })
        this.AudioSourceNode = this.AudioContext.createMediaStreamSource(AudioDevice)
    }

    static async SuspendAudioContext() {
        return new Promise(resolve => {
            this.AudioContext.suspend()
                .then(() => {
                    resolve()
                })
        })
    }

    static async ResumeAudioContext() {
        return new Promise(resolve => {
            this.AudioContext.resume()
                .then(() => {
                    resolve()
                })
        })
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


    static async GetData(TempoMonitoramento, QuantidadeAmostras) {
        return new Promise(async (resolve) => {

            let FrequencyDataBuffer = []
            let AmplitudeBuffer = []
            let contador = 0

            while (contador < QuantidadeAmostras) {
                contador++

                const Signal = await this.Freq()
                const Frequencia = await this.Pitch(Signal.timeDomain)
                FrequencyDataBuffer.push(Frequencia)

                const Amplitude = await this.LocalizaAmplitude(Frequencia, Signal.frequencia)
                AmplitudeBuffer.push(Amplitude)

                await this.AsyncDelay(TempoMonitoramento / QuantidadeAmostras)
            }

            const FinalData = await this.FixValues(FrequencyDataBuffer, AmplitudeBuffer)

            resolve({ frequencia: FinalData.frequencia, amplitude: FinalData.amplitude })
        })
    }


    static async Pitch(TimeDomainArray) {
        return new Promise(resolve => {

            let maximaCount = 0;
            let CorrolatedSignal = new Float32Array(this.Analyser.fftSize)
            let LocalMaxima = new Array(10)

            for (let l = 0; l < this.Analyser.fftSize; l++) {
                CorrolatedSignal[l] = 0;
                for (let i = 0; i < this.Analyser.fftSize - l; i++) {
                    CorrolatedSignal[l] += TimeDomainArray[i] * TimeDomainArray[i + l];
                }
                if (l > 1) {
                    if ((CorrolatedSignal[l - 2] - CorrolatedSignal[l - 1]) < 0
                        && (CorrolatedSignal[l - 1] - CorrolatedSignal[l]) > 0) {
                        LocalMaxima[maximaCount] = (l - 1);
                        maximaCount++;
                        if ((maximaCount >= LocalMaxima.length))
                            break;
                    }
                }
            }

            let maximaMean = LocalMaxima[0];

            for (let i = 1; i < maximaCount; i++)
                maximaMean += LocalMaxima[i] - LocalMaxima[i - 1];

            maximaMean /= maximaCount;

            resolve(this.AudioContext.sampleRate / maximaMean)
        })
    }


    static async AsyncDelay(timeout) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(false)
            }, timeout);
        })
    }

    static async FixValues(FreqBuffer, AmpBuffer) {
        let FreqArray = []
        let AmpArray = []

        return new Promise(resolve => {
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

            resolve({ frequencia: FreqArray, amplitude: AmpArray })
        })
    }


    static async Freq() {
        let FrequencyDataArray = new Float32Array(this.Analyser.fftSize)
        let TimeDomainDataArray = new Float32Array(this.Analyser.fftSize)

        return new Promise((resolve) => {
            this.Analyser.getFloatTimeDomainData(TimeDomainDataArray)
            this.Analyser.getFloatFrequencyData(FrequencyDataArray)
            resolve({
                timeDomain: TimeDomainDataArray,
                frequencia: FrequencyDataArray
            })
        })
    }


    // Localiza no array o valor de amplitude referente à frequência passada
    static async LocalizaAmplitude(Frequencia, AmplitudeArray) {
        return new Promise(resolve => {
            let PosicaoArray = Math.floor(Frequencia / this.HertzPorDivisao)
            resolve(AmplitudeArray[PosicaoArray])
        })
    }


    static async TriggerFrequencyDetector(ConfigObj, ValidaAmplitude = false) {
        return new Promise(async resolve => {

            const Sample = await this.GetData(50, 1)
            if (Sample.frequencia[0] >= ConfigObj.MinFreq && Sample.frequencia[0] <= ConfigObj.MaxFreq) {
                if (ValidaAmplitude) {
                    if (Sample.amplitude[0] >= ConfigObj.TriggerMinAmp && Sample.amplitude[0] <= ConfigObj.TriggerMaxAmp) {
                        resolve()
                    } else {
                        resolve(this.TriggerFrequencyDetector(ConfigObj, ValidaAmplitude))
                    }
                } else {
                    resolve()
                }
            } else {
                resolve(this.TriggerFrequencyDetector(ConfigObj, ValidaAmplitude))
            }
        })
    }


    static async TrackSlicer(Track, ConfigObj, ValidaAmplitude = false) {
        return new Promise(async resolve => {
            const QuantidadeAmostrasTrackAcionamento = ConfigObj.TrackSampleQuantity / (ConfigObj.TrackSize / ConfigObj.TempoDeAcionamento)

            for (let Index = 0; Index < Track.frequencia.length; Index++) {
                if (Track.frequencia.length - Index >= QuantidadeAmostrasTrackAcionamento) {

                    const FreqValue = Track.frequencia[Index]
                    if (FreqValue >= ConfigObj.MinFreq && FreqValue <= ConfigObj.MaxFreq) {

                        const FrequencyTrack = Track.frequencia.slice(Index, Index + QuantidadeAmostrasTrackAcionamento)
                        const ValidaPorcentagem = await this.ValidaPorcentagemAcionamentos(FrequencyTrack, ConfigObj)

                        if (ValidaPorcentagem) {
                            this.EncontrouTrackFrequencia = true
                            const AmplitudeTrack = Track.amplitude.slice(Index, Index + QuantidadeAmostrasTrackAcionamento)

                            if (ValidaAmplitude) {
                                const Media = await this.CalculaMediaFreqAmp(FrequencyTrack, AmplitudeTrack, ConfigObj)
                                if (Media.amplitude >= ConfigObj.MinAmplitude && Media.amplitude <= ConfigObj.MaxAmplitude) {
                                    resolve({
                                        result: true,
                                        frequencia: FrequencyTrack,
                                        frequenciaMedia: Media.frequencia,
                                        amplitude: AmplitudeTrack,
                                        amplitudeMedia: Media.amplitude
                                    })
                                    break
                                }

                            } else {
                                resolve({ result: true, frequencia: FrequencyTrack, amplitude: AmplitudeTrack })
                                break
                            }
                        }
                    }

                } else {
                    resolve({ result: false })
                    break
                }

            }
        })
    }

    static async CalculaMediaFreqAmp(FreqTrack, AmpTrack, ConfigObj) {
        return new Promise(resolve => {

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

            resolve({
                frequencia: SomaValoresFrequencia / Contador,
                amplitude: SomaValoresAmplitude / Contador
            })
        })
    }

    static async ValidaPorcentagemAcionamentos(Track, ConfigObj) {
        return new Promise(resolve => {
            const AmostrasNecessariasParaTrackValida = Track.length * (ConfigObj.PorcentagemAcionamentosValidos / 100)
            let Contador = 0

            for (const Valor of Track) {
                if (Valor >= ConfigObj.MinFreq && Valor <= ConfigObj.MaxFreq) {
                    Contador++
                }
            }

            if (Contador >= AmostrasNecessariasParaTrackValida) {
                resolve(true)
            } else {
                resolve(false)
            }
        })
    }

    static async TrackCapture(ConfigObj) {
        return new Promise(async resolve => {
            await this.TriggerFrequencyDetector(ConfigObj, true)

            const Track = await this.GetData(ConfigObj.TrackSize, ConfigObj.TrackSampleQuantity)
            const SlicedTrack = await this.TrackSlicer(Track, ConfigObj, true)
            if (SlicedTrack.result) {
                resolve(SlicedTrack)
            } else {
                resolve(this.TrackCapture(ConfigObj))
            }
        })
    }

    static async Init(ParamObj = {}) {
        ParamObj.SampleRate ||= 48000
        ParamObj.FFTSize ||= 2048
        ParamObj.SmoothingTimeConstant ||= 0.8
        ParamObj.Gain ||= 1

        return new Promise(resolve => {
            this.GetAudioDevice()
                .then(async AudioDevice => {
                    this.CreateAudioContext(AudioDevice, ParamObj)
                    this.CreateAnalyser(ParamObj)

                    this.HertzPorDivisao = ParamObj.SampleRate / ParamObj.FFTSize

                    await this.SuspendAudioContext()

                    resolve({ result: true, latencia: `${this.AudioContext.baseLatency * 1000}ms` })
                })
                .catch(() => {
                    resolve({ result: false })
                })
        })
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
        ConfigObj.TrackSampleQuantity ||= 20
        ConfigObj.TimeOut ||= 10000

        return new Promise(async resolve => {
            await this.ResumeAudioContext()

            const Capture = await Promise.race([this.TrackCapture(ConfigObj), this.AsyncDelay(ConfigObj.TimeOut)])

            await this.SuspendAudioContext()

            if (!Capture) {
                if (this.EncontrouTrackFrequencia) {
                    this.EncontrouTrackFrequencia = false

                    resolve({
                        result: false,
                        msg: "Foi detectada uma faixa na frequência esperada, mas fora da amplitude desejada"
                    })

                } else {
                    resolve({
                        result: false,
                        msg: "Nenhuma faixa detectada na frequência esperada"
                    })
                }
            } else {
                this.EncontrouTrackFrequencia = false

                resolve({
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
                })
            }
        })
    }


    static async LeituraFrequenciaParaConfigurar(TempoTotalLeitura, QuantidadeAmostras) {
        return new Promise(async resolve => {
            await this.ResumeAudioContext()

            const Track = await this.GetData(TempoTotalLeitura, QuantidadeAmostras)

            await this.SuspendAudioContext()
            console.log(Track.frequencia)
            resolve()
        })
    }


    static async DeterminaFrequenciaAmplitudeParaConfigurar(ConfigObj = {}) {
        ConfigObj.MinFreq ||= 2950
        ConfigObj.MaxFreq ||= 3050
        ConfigObj.TempoDeAcionamento ||= 500
        ConfigObj.PorcentagemAcionamentosValidos ||= 70
        ConfigObj.TrackSize ||= 700
        ConfigObj.TrackSampleQuantity ||= 20

        return new Promise(async resolve => {
            await this.ResumeAudioContext()

            await this.TriggerFrequencyDetector(ConfigObj)
            const Track = await this.GetData(ConfigObj.TrackSize, ConfigObj.TrackSampleQuantity)

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

                const Media = await this.CalculaMediaFreqAmp(SlicedTrack.frequencia, SlicedTrack.amplitude, ConfigObj)

                await this.SuspendAudioContext()

                resolve({
                    frequencia: { min: MenorFrequencia, max: MaiorFrequencia, media: Media.frequencia, valores: SlicedTrack.frequencia },
                    amplitude: { min: MenorAmplitude, max: MaiorAmplitude, media: Media.amplitude, valores: SlicedTrack.amplitude }
                })

            } else {
                resolve(this.DeterminaFrequenciaAmplitudeParaConfigurar(ConfigObj))
            }

        })
    }

}