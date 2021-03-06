import { BrsValue, ValueKind, BrsString, BrsInvalid, BrsBoolean } from "../BrsType";
import { BrsComponent } from "./BrsComponent";
import { RoUniversalControlEvent } from "./RoUniversalControlEvent";
import { RoAudioPlayerEvent } from "./RoAudioPlayerEvent";
import { BrsType } from "..";
import { Callable, StdlibArgument } from "../Callable";
import { Interpreter } from "../../interpreter";
import { Int32 } from "../Int32";
import { shared } from "../..";

export class RoMessagePort extends BrsComponent implements BrsValue {
    readonly kind = ValueKind.Object;
    readonly type = { KEY: 0, MOD: 1, SND: 2, IDX: 3, WAV: 4 };
    private messageQueue: BrsType[];
    private callbackQueue: Function[]; // TODO: consider having the id of the connected objects
    private buffer: Int32Array;
    private lastKey: number;
    private screen: boolean;
    private lastFlags: number;
    private audio: boolean;
    constructor() {
        super("roMessagePort");
        Object.freeze(this.type);
        this.registerMethods({
            ifMessagePort: [this.waitMessage, this.getMessage, this.peekMessage],
        });
        this.messageQueue = [];
        this.callbackQueue = [];
        this.lastKey = 0;
        this.screen = false;
        this.lastFlags = -1;
        this.audio = false;
        this.buffer = shared.get("buffer") || new Int32Array([]);
    }

    enableKeys(enable: boolean) {
        this.screen = enable;
    }

    enableAudio(enable: boolean) {
        this.audio = enable;
    }

    pushMessage(object: BrsType) {
        this.messageQueue.push(object);
    }

    registerCallback(callback: Function) {
        this.callbackQueue.push(callback);
    }

    asyncCancel() {
        this.callbackQueue = [];
    }

    toString(parent?: BrsType): string {
        return "<Component: roMessagePort>";
    }

    equalTo(other: BrsType) {
        return BrsBoolean.False;
    }

    wait(interpreter: Interpreter, ms: number) {
        if (this.screen) {
            if (ms === 0) {
                while (true) {
                    if (this.buffer[this.type.KEY] !== this.lastKey) {
                        return this.newControlEvent(interpreter);
                    }
                }
            } else {
                ms += new Date().getTime();
                while (new Date().getTime() < ms) {
                    if (this.buffer[this.type.KEY] !== this.lastKey) {
                        return this.newControlEvent(interpreter);
                    }
                }
            }
        } else if (this.audio) {
            if (ms === 0) {
                while (true) {
                    if (this.buffer[this.type.SND] !== this.lastFlags) {
                        this.lastFlags = this.buffer[this.type.SND];
                        if (this.lastFlags >= 0) {
                            return new RoAudioPlayerEvent(
                                this.lastFlags,
                                this.buffer[this.type.IDX]
                            );
                        }
                    }
                }
            } else {
                ms += new Date().getTime();
                while (new Date().getTime() < ms) {
                    if (this.buffer[this.type.SND] !== this.lastFlags) {
                        this.lastFlags = this.buffer[this.type.SND];
                        if (this.lastFlags >= 0) {
                            return new RoAudioPlayerEvent(
                                this.lastFlags,
                                this.buffer[this.type.IDX]
                            );
                        }
                    }
                }
            }
        } else {
            if (this.messageQueue.length > 0) {
                let message = this.messageQueue.shift();
                if (message) {
                    return message;
                }
            } else if (this.callbackQueue.length > 0) {
                let callback = this.callbackQueue.shift();
                if (callback) {
                    return callback();
                }
            }
            if (ms === 0) {
                postMessage(
                    "warning,[roMessagePort] No message in the queue, emulator will loop forever!"
                );
                while (true) {
                    // Loop forever
                }
            } else {
                postMessage("warning,[roMessagePort] No message in the queue!");
                ms += new Date().getTime();
                while (new Date().getTime() < ms) {
                    //wait the timeout time
                }
            }
        }
        return BrsInvalid.Instance;
    }

    newControlEvent(interpreter: Interpreter): RoUniversalControlEvent {
        this.lastKey = this.buffer[this.type.KEY];
        let mod = this.buffer[this.type.MOD];
        interpreter.lastKeyTime = interpreter.currKeyTime;
        interpreter.currKeyTime = Date.now();
        return new RoUniversalControlEvent("WD:0", this.lastKey, mod);
    }

    /** Waits until an event object is available or timeout milliseconds have passed. */
    private waitMessage = new Callable("waitMessage", {
        signature: {
            args: [new StdlibArgument("timeout", ValueKind.Int32)],
            returns: ValueKind.Object,
        },
        impl: (interpreter: Interpreter, timeout: Int32) => {
            return this.wait(interpreter, timeout.getValue());
        },
    });

    /** If an event object is available, it is returned. Otherwise invalid is returned. */
    private getMessage = new Callable("getMessage", {
        signature: {
            args: [],
            returns: ValueKind.Dynamic,
        },
        impl: (interpreter: Interpreter) => {
            if (this.screen) {
                if (this.buffer[this.type.KEY] !== this.lastKey) {
                    return this.newControlEvent(interpreter);
                }
            } else if (this.audio) {
                if (this.buffer[this.type.SND] !== this.lastFlags) {
                    this.lastFlags = this.buffer[this.type.SND];
                    if (this.lastFlags >= 0) {
                        return new RoAudioPlayerEvent(this.lastFlags, this.buffer[this.type.IDX]);
                    }
                }
            } else if (this.messageQueue.length > 0) {
                let message = this.messageQueue.shift();
                if (message) {
                    return message;
                }
            } else if (this.callbackQueue.length > 0) {
                let callback = this.callbackQueue.shift();
                if (callback) {
                    return callback();
                }
            }
            return BrsInvalid.Instance;
        },
    });

    /** Similar to GetMessage() but the returned object (if not invalid) remains in the message queue. */
    private peekMessage = new Callable("peekMessage", {
        signature: {
            args: [],
            returns: ValueKind.Dynamic,
        },
        impl: (_: Interpreter) => {
            if (this.screen) {
                if (this.buffer[this.type.KEY] !== this.lastKey) {
                    return new RoUniversalControlEvent(
                        "WD:0",
                        this.buffer[this.type.KEY],
                        this.buffer[this.type.MOD]
                    );
                }
            } else if (this.audio) {
                if (this.buffer[this.type.SND] !== this.lastFlags) {
                    if (this.buffer[this.type.SND] >= 0) {
                        return new RoAudioPlayerEvent(
                            this.buffer[this.type.SND],
                            this.buffer[this.type.IDX]
                        );
                    }
                }
            } else if (this.messageQueue.length > 0) {
                let message = this.messageQueue[0];
                if (message) {
                    return message;
                }
            } else if (this.callbackQueue.length > 0) {
                let callback = this.callbackQueue[0];
                if (callback) {
                    return callback();
                }
            }
            return BrsInvalid.Instance;
        },
    });
}
