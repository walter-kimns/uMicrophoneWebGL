const uMicrophoneWebGLPlugin = {
    $uMicrophoneWebGL: {
        startCallback: null,
        stopCallback: null,
        deviceListCallback: null,
        dataCallback: null,
        devices: [],
        samples: 2048,
        micIndex: 0,
        audioContext: null,
        mediaStreamSource: null,
        scriptProcessor: null,
        volumeAnalyser: null,
        volumeDataArray: null,
        
        initialize: async function(startCallback, stopCallback, deviceListCallback, dataCallback) {
            this.startCallback = startCallback;
            this.stopCallback = stopCallback;
            this.deviceListCallback = deviceListCallback;
            this.dataCallback = dataCallback;
            await this.updateDeviceList();
        },
        
        updateDeviceList: async function() {
            function convertStringToBuffer(str) {
                const size = lengthBytesUTF8(str) + 1;
                const buffer = _malloc(size);
                stringToUTF8(str, buffer, size); 
                return buffer;
            }
            
            // before calling enumerateDevices, this is needed.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach(track => track.stop());
            
            this.devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = this.devices.filter(x => x.kind === "audioinput");
            for (const device of this.devices) {
                device.labelBuffer = convertStringToBuffer(device.label);
                device.deviceIdBuffer = convertStringToBuffer(device.deviceId);
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { 
                        device: device.deviceId, 
                        sampleRate: { ideal: 44100 },
                    },
                    video: false,
                });
                const audioTrack = stream.getAudioTracks()[0];
                const settings = audioTrack.getSettings();
                device.sampleRate = settings.sampleRate;
                stream.getTracks().forEach(track => track.stop());
            }
            
            Module.dynCall_v(this.deviceListCallback);
        },
        
        getDeviceCount: function() {
            return this.devices.length;
        },
        
        getDevice: function(index) {
            return (index >= 0 && index < this.devices.length) ?
                this.devices[index] :
                null;
        },
        
        setDevice: function(index) {
            if (this.isRecording()) {
                console.warning("uMicrophoneWebGL: It is not possible to change the microphone device while recording.");
                return;
            }
            this.micIndex = index;
        },
        
        start: async function() {
            if (this.isRecording()) {
                console.warning("uMicrophoneWebGL: start has been called, but recording has already begun.");
                return;
            }
            
            const device = this.getDevice(this.micIndex);
            if (!device) return;
            
            try { 
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { 
                        device: device.deviceId,
                        sampleRate: { ideal: 44100 },
                    },
                    video: false,
                });
                this.audioContext = new AudioContext();
                this.source = this.audioContext.createMediaStreamSource(stream);
                this.scriptProcessor = this.audioContext.createScriptProcessor(this.samples, 1, 1);
                this.scriptProcessor.onaudioprocess = this.onAudioProcess.bind(this);
                this.source.connect(this.scriptProcessor);
                this.scriptProcessor.connect(this.audioContext.destination);
                
                // Setup volume analyser
                this.volumeAnalyser = this.audioContext.createAnalyser();
                this.volumeAnalyser.fftSize = 256;
                this.volumeDataArray = new Uint8Array(this.volumeAnalyser.frequencyBinCount);
                this.source.connect(this.volumeAnalyser);
                
                Module.dynCall_v(this.startCallback);
            } catch(err) {
                console.error(err);
            }
        },
        
        onAudioProcess: function(event) {
            try {
                const data = event.inputBuffer.getChannelData(0);
                const len = data.length;
                const ptr = _malloc(len * 4);
                HEAPF32.set(data, ptr >> 2);
                Module.dynCall_vii(this.dataCallback, ptr, len);
            } catch(err) {
                console.error(err);
            } 
        },
        
        stop: function() {
            if (!this.isRecording()) return;
            
            if (this.scriptProcessor) {
                this.scriptProcessor.disconnect();
                this.scriptProcessor = null;
            }

            if (this.mediaStreamSource) {
                this.mediaStreamSource.disconnect();
                this.mediaStreamSource = null;
            }

            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            
            try {
                Module.dynCall_v(this.stopCallback);
            } catch (err) {
                console.error(err);
            }
        },
        
        isRecording: function() {
            return this.scriptProcessor !== null;
        },

        getVolume: function() {
            if (this.volumeAnalyser && this.volumeDataArray) {
                this.volumeAnalyser.getByteFrequencyData(this.volumeDataArray);
                let sum = 0;
                for (let i = 0; i < this.volumeDataArray.length; i++) {
                    sum += this.volumeDataArray[i];
                }
                return sum / this.volumeDataArray.length; // Return average volume level
            }
            return 0; // Return 0 if analyser or data array is not available
        }
    },

    uMicrophoneWebGL_Initialize: async function(readyCallback, startCallback, stopCallback, deviceListCallback, dataCallback) {
        try {
            await uMicrophoneWebGL.initialize(startCallback, stopCallback, deviceListCallback, dataCallback);
            Module.dynCall_v(readyCallback);
        } catch (err) {
            console.error(err);
        }
    },
    
    uMicrophoneWebGL_RefreshDeviceList: async function() {
        try {
            await uMicrophoneWebGL.updateDeviceList();
        } catch (err) {
            console.error(err);
        }
    },
    
    uMicrophoneWebGL_GetDeviceCount: function() {
        return uMicrophoneWebGL.getDeviceCount();
    },
    
    uMicrophoneWebGL_GetDeviceId: function(index) {
        const device = uMicrophoneWebGL.getDevice(index);
        return device ? device.deviceIdBuffer : "";
    },
    
    uMicrophoneWebGL_GetLabel: function(index) {
        const device = uMicrophoneWebGL.getDevice(index);
        return device ? device.labelBuffer : "";
    },
    
    uMicrophoneWebGL_GetSampleRate: function(index) {
        const device = uMicrophoneWebGL.getDevice(index);
        return device ? device.sampleRate : 0;
    },
    
    uMicrophoneWebGL_SetDevice: function(index) {
        uMicrophoneWebGL.setDevice(index);
    },
    
    uMicrophoneWebGL_Start: function() {
        uMicrophoneWebGL.start();
    },
    
    uMicrophoneWebGL_Stop: function() {
        uMicrophoneWebGL.stop();
    },
    
    uMicrophoneWebGL_IsRecording: function() {
        return uMicrophoneWebGL.isRecording();
    },

    uMicrophoneWebGL_GetVolume: function() {
        return uMicrophoneWebGL.getVolume();
    },
};

autoAddDeps(uMicrophoneWebGLPlugin, '$uMicrophoneWebGL');
mergeInto(LibraryManager.library, uMicrophoneWebGLPlugin);
