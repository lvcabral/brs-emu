import { BrsValue, ValueKind, BrsString, BrsInvalid, BrsBoolean } from "../BrsType";
import { BrsComponent } from "./BrsComponent";
import { BrsType } from "..";
import { Callable, StdlibArgument } from "../Callable";
import { Interpreter } from "../../interpreter";
import { Int32 } from "../Int32";
import URL from "url-parse";

export class RoAudioResource extends BrsComponent implements BrsValue {
    readonly kind = ValueKind.Object;
    private audioName: string;
    private playing: boolean;
    private valid: boolean;

    constructor(interpreter: Interpreter, name: BrsString) {
        super("roAudioResource", ["ifAudioResource"]);
        this.valid = true;
        const systemwav = new Set(["select", "navsingle", "navmulti", "deadend"]);
        if (!systemwav.has(name.value.toLowerCase())) {
            const url = new URL(name.value);
            const volume = interpreter.fileSystem.get(url.protocol);
            if (volume) {
                this.valid = volume.existsSync(url.pathname);
                if (!this.valid) {
                    console.error("File not found!", url.pathname);
                }
            } else {
                console.error("Invalid volume:", name);
                this.valid = false;
            }
            // if (url.protocol === "tmp:" || url.protocol === "cachefs:") {
            //     // TODO: Send data back to rendering process.
            // }
        }
        this.audioName = name.value;
        this.playing = false;
        this.registerMethods([this.trigger, this.isPlaying, this.stop, this.maxSimulStreams]);
    }

    toString(parent?: BrsType): string {
        return "<Component: roAudioResource>";
    }

    equalTo(other: BrsType) {
        return BrsBoolean.False;
    }

    isValid() {
        return this.valid;
    }

    /** Triggers the start of the audio resource sound playback. */
    private trigger = new Callable("trigger", {
        signature: {
            args: [
                new StdlibArgument("volume", ValueKind.Int32),
                new StdlibArgument("index", ValueKind.Int32, new Int32(0)),
            ],
            returns: ValueKind.Void,
        },
        impl: (_: Interpreter, volume: Int32, index: Int32) => {
            postMessage(`trigger,${this.audioName},${volume.toString()}`);
            this.playing = true;
            return BrsInvalid.Instance;
        },
    });

    /** Returns true if this audio resource is currently playing */
    private isPlaying = new Callable("isPlaying", {
        signature: {
            args: [],
            returns: ValueKind.Boolean,
        },
        impl: (_: Interpreter) => {
            return BrsBoolean.from(this.playing);
        },
    });

    /** Stops playing the audio resource. */
    private stop = new Callable("stop", {
        signature: {
            args: [],
            returns: ValueKind.Void,
        },
        impl: (_: Interpreter) => {
            postMessage(`stop,${this.audioName}`);
            this.playing = false;
            return BrsInvalid.Instance;
        },
    });

    /** Returns the maximum number of simultaneous wav playback. */
    private maxSimulStreams = new Callable("maxSimulStreams", {
        signature: {
            args: [],
            returns: ValueKind.Int32,
        },
        impl: (_: Interpreter) => {
            return new Int32(2);
        },
    });
}

export function createAudioResource(interpreter: Interpreter, name: BrsString) {
    console.log(name);
    const audio = new RoAudioResource(interpreter, name);
    return audio.isValid() ? audio : BrsInvalid.Instance;
}
